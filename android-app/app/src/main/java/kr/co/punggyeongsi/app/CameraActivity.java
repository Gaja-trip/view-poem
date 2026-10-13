package kr.co.punggyeongsi.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.annotation.NonNull;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutionException;

public final class CameraActivity extends ComponentActivity {
    public static final String EXTRA_PHOTO_PATH = "photo_path";
    public static final String EXTRA_PHOTO_NAME = "photo_name";

    private static final int CAMERA_PERMISSION_REQUEST = 5101;
    private static final int CLAY = Color.rgb(155, 98, 71);

    private PreviewView previewView;
    private TextView statusText;
    private Button shutterButton;
    private ImageCapture imageCapture;
    private ProcessCameraProvider cameraProvider;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        setContentView(createCameraView());

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) {
            bindCamera();
        } else {
            requestPermissions(
                    new String[]{Manifest.permission.CAMERA},
                    CAMERA_PERMISSION_REQUEST);
        }
    }

    private View createCameraView() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        previewView = new PreviewView(this);
        previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        root.addView(previewView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        TextView closeButton = new TextView(this);
        closeButton.setText("닫기");
        closeButton.setTextColor(Color.WHITE);
        closeButton.setTextSize(16);
        closeButton.setGravity(Gravity.CENTER);
        closeButton.setBackground(roundedDrawable(Color.argb(150, 0, 0, 0), dp(18)));
        closeButton.setOnClickListener(ignored -> {
            setResult(RESULT_CANCELED);
            finish();
        });
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(dp(70), dp(42));
        closeParams.gravity = Gravity.TOP | Gravity.END;
        closeParams.topMargin = dp(18);
        closeParams.rightMargin = dp(18);
        root.addView(closeButton, closeParams);

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.VERTICAL);
        controls.setGravity(Gravity.CENTER);
        controls.setPadding(dp(20), dp(14), dp(20), dp(20));
        controls.setBackgroundColor(Color.argb(135, 0, 0, 0));
        FrameLayout.LayoutParams controlsParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        controlsParams.gravity = Gravity.BOTTOM;
        root.addView(controls, controlsParams);

        statusText = new TextView(this);
        statusText.setText("카메라를 준비하고 있습니다…");
        statusText.setTextColor(Color.WHITE);
        statusText.setTextSize(14);
        statusText.setGravity(Gravity.CENTER);
        controls.addView(statusText, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        shutterButton = new Button(this);
        shutterButton.setText("이 풍경 촬영하기");
        shutterButton.setTextColor(Color.WHITE);
        shutterButton.setTextSize(17);
        shutterButton.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        shutterButton.setAllCaps(false);
        shutterButton.setEnabled(false);
        shutterButton.setAlpha(0.5f);
        shutterButton.setBackground(roundedDrawable(CLAY, dp(18)));
        shutterButton.setOnClickListener(ignored -> takePhoto());
        LinearLayout.LayoutParams shutterParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(58));
        shutterParams.topMargin = dp(12);
        controls.addView(shutterButton, shutterParams);

        return root;
    }

    private void bindCamera() {
        ListenableFuture<ProcessCameraProvider> providerFuture =
                ProcessCameraProvider.getInstance(this);
        providerFuture.addListener(() -> {
            try {
                cameraProvider = providerFuture.get();
                Preview preview = new Preview.Builder().build();
                imageCapture = new ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                        .setJpegQuality(95)
                        .build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());

                cameraProvider.unbindAll();
                try {
                    cameraProvider.bindToLifecycle(
                            this,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            preview,
                            imageCapture);
                } catch (IllegalArgumentException noBackCamera) {
                    cameraProvider.bindToLifecycle(
                            this,
                            CameraSelector.DEFAULT_FRONT_CAMERA,
                            preview,
                            imageCapture);
                }

                shutterButton.setEnabled(true);
                shutterButton.setAlpha(1f);
                statusText.setText("화면을 확인하고 촬영해 주세요.");
            } catch (ExecutionException | InterruptedException | RuntimeException error) {
                if (error instanceof InterruptedException) Thread.currentThread().interrupt();
                showCameraError("카메라를 시작하지 못했습니다.");
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void takePhoto() {
        ImageCapture capture = imageCapture;
        if (capture == null) return;
        if (previewView.getDisplay() != null) {
            capture.setTargetRotation(previewView.getDisplay().getRotation());
        }

        File pictureRoot = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        if (pictureRoot == null) {
            showCameraError("촬영 파일을 저장할 공간이 없습니다.");
            return;
        }
        File captureDirectory = new File(pictureRoot, "captures");
        if (!captureDirectory.exists() && !captureDirectory.mkdirs()) {
            showCameraError("촬영 폴더를 만들지 못했습니다.");
            return;
        }

        String fileName = "풍경_" + new SimpleDateFormat(
                "yyyyMMdd_HHmmss_SSS",
                Locale.KOREA).format(new Date()) + ".jpg";
        File photoFile = new File(captureDirectory, fileName);

        shutterButton.setEnabled(false);
        shutterButton.setAlpha(0.5f);
        statusText.setText("풍경을 촬영하고 있습니다…");

        ImageCapture.OutputFileOptions outputOptions =
                new ImageCapture.OutputFileOptions.Builder(photoFile).build();
        capture.takePicture(
                outputOptions,
                ContextCompat.getMainExecutor(this),
                new ImageCapture.OnImageSavedCallback() {
                    @Override
                    public void onImageSaved(
                            @NonNull ImageCapture.OutputFileResults outputFileResults) {
                        if (!photoFile.isFile() || photoFile.length() == 0) {
                            showCameraError("촬영 파일이 비어 있습니다. 다시 촬영해 주세요.");
                            return;
                        }
                        Intent result = new Intent();
                        result.putExtra(EXTRA_PHOTO_PATH, photoFile.getAbsolutePath());
                        result.putExtra(EXTRA_PHOTO_NAME, fileName);
                        setResult(RESULT_OK, result);
                        finish();
                    }

                    @Override
                    public void onError(@NonNull ImageCaptureException error) {
                        photoFile.delete();
                        showCameraError("사진 촬영에 실패했습니다. 다시 시도해 주세요.");
                    }
                });
    }

    private void showCameraError(String message) {
        statusText.setText(message);
        shutterButton.setEnabled(imageCapture != null);
        shutterButton.setAlpha(imageCapture == null ? 0.5f : 1f);
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            @NonNull String[] permissions,
            @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != CAMERA_PERMISSION_REQUEST) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            bindCamera();
        } else {
            showCameraError("풍경을 촬영하려면 카메라 권한이 필요합니다.");
        }
    }

    @Override
    protected void onDestroy() {
        if (cameraProvider != null) cameraProvider.unbindAll();
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static GradientDrawable roundedDrawable(int fillColor, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fillColor);
        drawable.setCornerRadius(radius);
        return drawable;
    }
}
