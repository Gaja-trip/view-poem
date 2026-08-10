package kr.co.punggyeongsi.app;

import android.app.Activity;
import android.app.Dialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.SafeBrowsingResponse;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public final class MainActivity extends Activity {
    private static final String APP_URL =
            "https://punggyeongsi-view-poem.hopesound.chatgpt.site";
    private static final String APP_HOST = "punggyeongsi-view-poem.hopesound.chatgpt.site";
    private static final int FILE_CHOOSER_REQUEST = 4102;

    private final Map<WebView, Dialog> popupWindows = new HashMap<>();
    private WebView webView;
    private ValueCallback<Uri[]> pendingFileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(242, 238, 227));
        getWindow().setNavigationBarColor(Color.rgb(242, 238, 227));

        webView = new WebView(this);
        configureWebView(webView);
        setContentView(webView);

        if (savedInstanceState == null) {
            if (hasNetworkConnection()) {
                webView.loadUrl(APP_URL);
            } else {
                showOfflinePage();
            }
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void configureWebView(WebView target) {
        WebSettings settings = target.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " PunggyeongsiAndroid/1.0");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(target, true);
        target.setBackgroundColor(Color.rgb(242, 238, 227));
        target.addJavascriptInterface(new NativeDownloads(), "PunggyeongsiDownloads");
        target.setWebViewClient(new AppWebViewClient());
        target.setWebChromeClient(new AppWebChromeClient());
        target.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                downloadBrowserBlob(target, url, fileName);
            } else {
                enqueueDownload(url, userAgent, mimeType, fileName);
            }
        });
    }

    private boolean hasNetworkConnection() {
        ConnectivityManager manager =
                (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        Network network = manager.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
        return capabilities != null
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private void showOfflinePage() {
        String html = "<!doctype html><html lang='ko'><meta name='viewport' "
                + "content='width=device-width,initial-scale=1'><body style='margin:0;display:grid;"
                + "place-items:center;min-height:100vh;background:#f2eee3;color:#252a25;"
                + "font-family:sans-serif;text-align:center'><main><h1 style='font-family:serif'>풍경시</h1>"
                + "<p>인터넷 연결을 확인한 뒤 다시 열어주세요.</p>"
                + "<button style='padding:12px 20px' onclick='location.href=\"" + APP_URL + "\"'>"
                + "다시 시도</button></main></body></html>";
        webView.loadDataWithBaseURL(APP_URL, html, "text/html", "utf-8", null);
    }

    private boolean isAppNavigation(Uri uri) {
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (!("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) || host == null) {
            return false;
        }
        String normalizedHost = host.toLowerCase(Locale.ROOT);
        return normalizedHost.equals(APP_HOST)
                || normalizedHost.endsWith(".chatgpt.com")
                || normalizedHost.equals("chatgpt.com")
                || normalizedHost.endsWith(".openai.com")
                || normalizedHost.equals("openai.com")
                || normalizedHost.equals("accounts.google.com");
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "이 링크를 열 수 있는 앱이 없어요.", Toast.LENGTH_SHORT).show();
        }
    }

    private void downloadBrowserBlob(WebView source, String url, String fileName) {
        String safeUrl = JSONObject.quote(url);
        String safeFileName = JSONObject.quote(sanitizeFileName(fileName));
        String script = "(async()=>{try{const r=await fetch(" + safeUrl + ");"
                + "const b=await r.blob();const fr=new FileReader();"
                + "fr.onloadend=()=>PunggyeongsiDownloads.saveBase64(fr.result," + safeFileName + ");"
                + "fr.readAsDataURL(b);}catch(e){PunggyeongsiDownloads.failed();}})();";
        source.evaluateJavascript(script, null);
    }

    private void enqueueDownload(String url, String userAgent, String mimeType, String fileName) {
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setMimeType(mimeType);
            request.addRequestHeader("User-Agent", userAgent);
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) request.addRequestHeader("Cookie", cookies);
            request.setTitle(fileName);
            request.setDescription("풍경시에서 파일을 저장하고 있어요.");
            request.setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS,
                    "풍경시/" + sanitizeFileName(fileName));
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            manager.enqueue(request);
            Toast.makeText(this, "다운로드를 시작했어요.", Toast.LENGTH_SHORT).show();
        } catch (RuntimeException error) {
            Toast.makeText(this, "파일을 저장하지 못했어요.", Toast.LENGTH_SHORT).show();
        }
    }

    private static String sanitizeFileName(String fileName) {
        String candidate = fileName == null || fileName.trim().isEmpty() ? "풍경시.png" : fileName;
        return candidate.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            if (pendingFileCallback != null) {
                pendingFileCallback.onReceiveValue(result);
                pendingFileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
        for (Dialog dialog : popupWindows.values()) dialog.dismiss();
        popupWindows.clear();
        webView.removeJavascriptInterface("PunggyeongsiDownloads");
        webView.destroy();
        super.onDestroy();
    }

    private final class AppWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isAppNavigation(uri)) return false;
            openExternal(uri);
            return true;
        }

        @Override
        public void onSafeBrowsingHit(
                WebView view,
                WebResourceRequest request,
                int threatType,
                SafeBrowsingResponse callback) {
            callback.backToSafety(true);
            Toast.makeText(MainActivity.this, "안전하지 않은 페이지를 차단했어요.", Toast.LENGTH_LONG).show();
        }

        @Override
        public void onReceivedHttpError(
                WebView view,
                WebResourceRequest request,
                WebResourceResponse errorResponse) {
            if (request.isForMainFrame() && errorResponse.getStatusCode() >= 500) {
                Toast.makeText(MainActivity.this, "페이지를 불러오지 못했어요.", Toast.LENGTH_SHORT).show();
            }
        }
    }

    private final class AppWebChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> filePathCallback,
                FileChooserParams fileChooserParams) {
            if (pendingFileCallback != null) pendingFileCallback.onReceiveValue(null);
            pendingFileCallback = filePathCallback;
            try {
                Intent intent = fileChooserParams.createIntent();
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                return true;
            } catch (ActivityNotFoundException error) {
                pendingFileCallback = null;
                Toast.makeText(MainActivity.this, "사진 선택기를 열 수 없어요.", Toast.LENGTH_SHORT).show();
                return false;
            }
        }

        @Override
        public boolean onCreateWindow(
                WebView source,
                boolean isDialog,
                boolean isUserGesture,
                Message resultMsg) {
            WebView popup = new WebView(MainActivity.this);
            configureWebView(popup);
            Dialog dialog = new Dialog(MainActivity.this);
            dialog.setContentView(
                    popup,
                    new ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT));
            dialog.setOnDismissListener(ignored -> {
                popupWindows.remove(popup);
                popup.destroy();
            });
            popupWindows.put(popup, dialog);
            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(popup);
            resultMsg.sendToTarget();
            dialog.show();
            if (dialog.getWindow() != null) {
                dialog.getWindow().setLayout(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT);
            }
            return true;
        }

        @Override
        public void onCloseWindow(WebView window) {
            Dialog dialog = popupWindows.remove(window);
            if (dialog != null) dialog.dismiss();
        }
    }

    public final class NativeDownloads {
        @JavascriptInterface
        public void saveBase64(String dataUrl, String requestedFileName) {
            try {
                int comma = dataUrl.indexOf(',');
                if (comma < 0) throw new IOException("Invalid data URL");
                String metadata = dataUrl.substring(0, comma);
                String mimeType = "image/png";
                int colon = metadata.indexOf(':');
                int semicolon = metadata.indexOf(';');
                if (colon >= 0 && semicolon > colon) {
                    mimeType = metadata.substring(colon + 1, semicolon);
                }
                byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
                String fileName = sanitizeFileName(requestedFileName);

                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(
                        MediaStore.Downloads.RELATIVE_PATH,
                        Environment.DIRECTORY_DOWNLOADS + "/풍경시");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri destination = getContentResolver().insert(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                        values);
                if (destination == null) throw new IOException("No destination");
                try (OutputStream output = getContentResolver().openOutputStream(destination)) {
                    if (output == null) throw new IOException("No output stream");
                    output.write(bytes);
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(destination, values, null, null);
                runOnUiThread(() -> Toast.makeText(
                        MainActivity.this,
                        "다운로드/풍경시에 저장했어요.",
                        Toast.LENGTH_LONG).show());
            } catch (Exception error) {
                failed();
            }
        }

        @JavascriptInterface
        public void failed() {
            runOnUiThread(() -> Toast.makeText(
                    MainActivity.this,
                    "파일을 저장하지 못했어요.",
                    Toast.LENGTH_LONG).show());
        }
    }
}
