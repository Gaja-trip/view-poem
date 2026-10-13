package kr.co.punggyeongsi.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.ImageDecoder;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Size;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.File;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int CAPTURE_PHOTO_REQUEST = 4101;
    private static final int SAVE_DOCUMENT_REQUEST = 4102;
    private static final int CHOOSE_IMAGE_REQUEST = 4103;

    private static final String STATE_SKETCH_URI = "sketch_uri";
    private static final String STATE_SKETCH_NAME = "sketch_name";
    private static final String STATE_SOURCE_URI = "source_uri";
    private static final String STATE_SOURCE_NAME = "source_name";
    private static final String STATE_COLOR_STRENGTH = "color_strength";
    private static final String STATE_RENDERED_COLOR_STRENGTH = "rendered_color_strength";
    private static final String STATE_STYLE = "sketch_style";
    private static final String STATE_RENDERED_STYLE = "rendered_sketch_style";

    private static final int PAPER = Color.rgb(244, 241, 232);
    private static final int INK = Color.rgb(38, 43, 38);
    private static final int PINE = Color.rgb(47, 74, 56);
    private static final int CLAY = Color.rgb(155, 98, 71);
    private static final int MUTED = Color.rgb(101, 108, 99);
    private static final int MAX_SKETCH_EDGE = 900;
    private static final int DEFAULT_COLOR_STRENGTH = 70;

    private final ExecutorService imageExecutor = Executors.newSingleThreadExecutor();

    private ImageView previewImage;
    private TextView previewPlaceholder;
    private TextView statusText;
    private TextView colorValueText;
    private SeekBar colorSeekBar;
    private RadioGroup styleChoices;
    private RadioButton pencilChoice;
    private RadioButton watercolorChoice;
    private Button captureButton;
    private Button galleryButton;
    private Button saveButton;

    private Uri currentSketchUri;
    private String currentSketchName;
    private Uri currentSourceUri;
    private String currentSourceName;
    private int colorStrengthPercent = DEFAULT_COLOR_STRENGTH;
    private int renderedColorStrength = DEFAULT_COLOR_STRENGTH;
    private SketchRenderer.Style currentStyle = SketchRenderer.Style.WATERCOLOR;
    private SketchRenderer.Style renderedStyle = SketchRenderer.Style.WATERCOLOR;
    private boolean restoringControls;
    private volatile int activeJob;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(PAPER);
        getWindow().setNavigationBarColor(PAPER);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

        setContentView(createContentView());

        if (savedInstanceState != null) {
            currentSketchUri = parseUri(savedInstanceState.getString(STATE_SKETCH_URI));
            currentSketchName = savedInstanceState.getString(STATE_SKETCH_NAME);
            currentSourceUri = parseUri(savedInstanceState.getString(STATE_SOURCE_URI));
            currentSourceName = savedInstanceState.getString(STATE_SOURCE_NAME);
            colorStrengthPercent = savedInstanceState.getInt(
                    STATE_COLOR_STRENGTH,
                    DEFAULT_COLOR_STRENGTH);
            renderedColorStrength = savedInstanceState.getInt(
                    STATE_RENDERED_COLOR_STRENGTH,
                    colorStrengthPercent);
            currentStyle = parseStyle(savedInstanceState.getString(STATE_STYLE));
            renderedStyle = parseStyle(savedInstanceState.getString(STATE_RENDERED_STYLE));
            restoringControls = true;
            colorSeekBar.setProgress(colorStrengthPercent);
            styleChoices.check(currentStyle == SketchRenderer.Style.PENCIL
                    ? pencilChoice.getId() : watercolorChoice.getId());
            restoringControls = false;
            updateColorValue(colorStrengthPercent);
        }

        if (currentSourceUri != null && currentSketchUri != null
                && (currentStyle != renderedStyle || colorStrengthPercent != renderedColorStrength)) {
            startSketchJob(currentSourceUri, currentSourceName,
                    currentSketchUri, currentSketchName, colorStrengthPercent);
        } else if (currentSketchUri != null) {
            loadExistingSketch(currentSketchUri);
        } else if (currentSourceUri != null) {
            startSketchJob(currentSourceUri, currentSourceName, null, null, colorStrengthPercent);
        } else {
            setReadyState(false);
        }
    }

    private View createContentView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(PAPER);
        root.setPadding(dp(22), dp(20), dp(22), dp(20));

        TextView eyebrow = new TextView(this);
        eyebrow.setText("산책자의 기록");
        eyebrow.setTextColor(CLAY);
        eyebrow.setTextSize(13);
        eyebrow.setLetterSpacing(0.12f);
        root.addView(eyebrow, wrapContent());

        TextView title = new TextView(this);
        title.setText("풍경을 스케치하다");
        title.setTextColor(INK);
        title.setTextSize(29);
        title.setTypeface(Typeface.create("serif", Typeface.BOLD));
        LinearLayout.LayoutParams titleParams = wrapContent();
        titleParams.topMargin = dp(4);
        root.addView(title, titleParams);

        TextView subtitle = new TextView(this);
        subtitle.setText("풍경을 촬영하거나 불러와 종이 위의 연필화와 수채화로 간직하세요.");
        subtitle.setTextColor(MUTED);
        subtitle.setTextSize(15);
        subtitle.setLineSpacing(dp(3), 1f);
        LinearLayout.LayoutParams subtitleParams = matchWidthWrap();
        subtitleParams.topMargin = dp(6);
        root.addView(subtitle, subtitleParams);

        FrameLayout photoFrame = new FrameLayout(this);
        photoFrame.setBackground(roundedDrawable(Color.rgb(227, 225, 213), dp(22), 0, 0));
        photoFrame.setClipToOutline(true);
        LinearLayout.LayoutParams photoParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f);
        photoParams.topMargin = dp(18);
        photoParams.bottomMargin = dp(14);
        photoFrame.setMinimumHeight(dp(190));
        root.addView(photoFrame, photoParams);

        previewImage = new ImageView(this);
        previewImage.setScaleType(ImageView.ScaleType.FIT_CENTER);
        previewImage.setContentDescription("완성된 풍경 스케치");
        previewImage.setVisibility(View.GONE);
        photoFrame.addView(previewImage, matchParentFrame());

        previewPlaceholder = new TextView(this);
        previewPlaceholder.setText("풍경을 촬영하거나 불러오면\n완성된 스케치가 여기에 나타납니다");
        previewPlaceholder.setTextColor(MUTED);
        previewPlaceholder.setTextSize(16);
        previewPlaceholder.setGravity(Gravity.CENTER);
        previewPlaceholder.setLineSpacing(dp(5), 1f);
        photoFrame.addView(previewPlaceholder, matchParentFrame());

        statusText = new TextView(this);
        statusText.setText("스케치할 풍경을 선택해 주세요.");
        statusText.setTextColor(MUTED);
        statusText.setTextSize(14);
        statusText.setGravity(Gravity.CENTER);
        root.addView(statusText, matchWidthWrap());

        styleChoices = new RadioGroup(this);
        styleChoices.setOrientation(RadioGroup.HORIZONTAL);
        pencilChoice = createStyleChoice("연필 스케치");
        watercolorChoice = createStyleChoice("수채 스케치");
        styleChoices.addView(pencilChoice, new RadioGroup.LayoutParams(0, dp(44), 1f));
        styleChoices.addView(watercolorChoice, new RadioGroup.LayoutParams(0, dp(44), 1f));
        styleChoices.check(watercolorChoice.getId());
        styleChoices.setOnCheckedChangeListener((group, checkedId) -> {
            currentStyle = checkedId == pencilChoice.getId()
                    ? SketchRenderer.Style.PENCIL : SketchRenderer.Style.WATERCOLOR;
            if (!restoringControls) {
                if (currentSourceUri != null) rebuildCurrentSketchIfNeeded();
                else setReadyState(false);
            }
        });
        LinearLayout.LayoutParams styleParams = matchWidthWrap();
        styleParams.topMargin = dp(6);
        root.addView(styleChoices, styleParams);

        LinearLayout colorLabelRow = new LinearLayout(this);
        colorLabelRow.setOrientation(LinearLayout.HORIZONTAL);
        colorLabelRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams colorLabelParams = matchWidthWrap();
        colorLabelParams.topMargin = dp(2);
        root.addView(colorLabelRow, colorLabelParams);

        TextView colorLabel = new TextView(this);
        colorLabel.setText(R.string.sketch_color);
        colorLabel.setTextColor(INK);
        colorLabel.setTextSize(14);
        colorLabel.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        colorLabelRow.addView(colorLabel, new LinearLayout.LayoutParams(0, dp(28), 1f));

        colorValueText = new TextView(this);
        colorValueText.setTextColor(PINE);
        colorValueText.setTextSize(14);
        colorValueText.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        colorLabelRow.addView(colorValueText, wrapContent());

        colorSeekBar = new SeekBar(this);
        colorSeekBar.setMax(100);
        colorSeekBar.setProgress(DEFAULT_COLOR_STRENGTH);
        colorSeekBar.setContentDescription(getString(R.string.sketch_color));
        colorSeekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                colorStrengthPercent = progress;
                updateColorValue(progress);
            }

            @Override
            public void onStartTrackingTouch(SeekBar seekBar) {
                // The current preview stays visible while the user chooses a value.
            }

            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {
                rebuildCurrentSketchIfNeeded();
            }
        });
        LinearLayout.LayoutParams seekParams = matchWidthHeight(dp(34));
        seekParams.topMargin = dp(1);
        root.addView(colorSeekBar, seekParams);
        updateColorValue(DEFAULT_COLOR_STRENGTH);

        LinearLayout imageActions = new LinearLayout(this);
        imageActions.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams imageActionsParams = matchWidthHeight(dp(56));
        imageActionsParams.topMargin = dp(8);
        root.addView(imageActions, imageActionsParams);

        captureButton = new Button(this);
        captureButton.setText("풍경 촬영하기");
        captureButton.setTextColor(Color.WHITE);
        captureButton.setTextSize(16);
        captureButton.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        captureButton.setAllCaps(false);
        captureButton.setBackground(roundedDrawable(CLAY, dp(16), 0, 0));
        captureButton.setOnClickListener(ignored -> startCamera());
        LinearLayout.LayoutParams captureParams = new LinearLayout.LayoutParams(0, dp(56), 1f);
        captureParams.rightMargin = dp(5);
        imageActions.addView(captureButton, captureParams);

        galleryButton = new Button(this);
        galleryButton.setText("이미지 불러오기");
        galleryButton.setTextColor(PINE);
        galleryButton.setTextSize(16);
        galleryButton.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        galleryButton.setAllCaps(false);
        galleryButton.setBackground(roundedDrawable(PAPER, dp(16), dp(1), PINE));
        galleryButton.setOnClickListener(ignored -> chooseImageFromPhone());
        LinearLayout.LayoutParams galleryParams = new LinearLayout.LayoutParams(0, dp(56), 1f);
        galleryParams.leftMargin = dp(5);
        imageActions.addView(galleryButton, galleryParams);

        saveButton = new Button(this);
        saveButton.setText(R.string.save_sketch_drive);
        saveButton.setTextColor(Color.WHITE);
        saveButton.setTextSize(16);
        saveButton.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        saveButton.setAllCaps(false);
        saveButton.setBackground(roundedDrawable(PINE, dp(16), 0, 0));
        saveButton.setOnClickListener(ignored -> chooseDriveLocation());
        LinearLayout.LayoutParams saveParams = matchWidthHeight(dp(56));
        saveParams.topMargin = dp(10);
        root.addView(saveButton, saveParams);

        TextView help = new TextView(this);
        help.setText("스케치는 휴대폰의 사진/풍경시/스케치에도 보관됩니다.");
        help.setTextColor(MUTED);
        help.setTextSize(12);
        help.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams helpParams = matchWidthWrap();
        helpParams.topMargin = dp(9);
        root.addView(help, helpParams);

        return root;
    }

    private void startCamera() {
        startActivityForResult(
                new Intent(this, CameraActivity.class),
                CAPTURE_PHOTO_REQUEST);
    }

    private void chooseImageFromPhone() {
        Intent chooseIntent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        chooseIntent.addCategory(Intent.CATEGORY_OPENABLE);
        chooseIntent.setType("image/*");
        chooseIntent.addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        try {
            startActivityForResult(chooseIntent, CHOOSE_IMAGE_REQUEST);
        } catch (ActivityNotFoundException error) {
            showError("이미지 선택 화면을 열지 못했습니다.");
        }
    }

    private void chooseDriveLocation() {
        if (currentSketchUri == null) return;
        Intent saveIntent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        saveIntent.addCategory(Intent.CATEGORY_OPENABLE);
        saveIntent.setType("image/jpeg");
        saveIntent.putExtra(Intent.EXTRA_TITLE, currentSketchName);
        try {
            startActivityForResult(saveIntent, SAVE_DOCUMENT_REQUEST);
        } catch (ActivityNotFoundException error) {
            showError("파일 저장 화면을 열지 못했습니다.");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == CAPTURE_PHOTO_REQUEST) {
            if (resultCode == RESULT_OK && data != null) {
                String photoPath = data.getStringExtra(CameraActivity.EXTRA_PHOTO_PATH);
                String photoName = data.getStringExtra(CameraActivity.EXTRA_PHOTO_NAME);
                if (photoPath != null) {
                    File photoFile = new File(photoPath);
                    if (photoFile.isFile() && photoFile.length() > 0) {
                        selectNewSource(Uri.fromFile(photoFile), photoName);
                    } else {
                        showError("촬영 파일을 만들지 못했습니다. 다시 촬영해 주세요.");
                    }
                } else {
                    showError("촬영 결과를 받지 못했습니다. 다시 촬영해 주세요.");
                }
            } else if (resultCode != RESULT_CANCELED) {
                showError("카메라 촬영을 완료하지 못했습니다.");
            }
            return;
        }

        if (requestCode == CHOOSE_IMAGE_REQUEST
                && resultCode == RESULT_OK
                && data != null
                && data.getData() != null) {
            Uri selectedImage = data.getData();
            if ((data.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0) {
                try {
                    getContentResolver().takePersistableUriPermission(
                            selectedImage,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (SecurityException ignored) {
                    // Some gallery providers grant access for this app session only.
                }
            }
            selectNewSource(selectedImage, null);
            return;
        }

        if (requestCode == SAVE_DOCUMENT_REQUEST
                && resultCode == RESULT_OK
                && data != null
                && data.getData() != null) {
            copySketchTo(data.getData());
        }
    }

    private void selectNewSource(Uri sourceUri, String nameHint) {
        if (currentSourceUri != null && !currentSourceUri.equals(sourceUri)) {
            deletePrivateCapture(currentSourceUri);
        }
        currentSourceUri = sourceUri;
        currentSourceName = nameHint;
        currentSketchUri = null;
        currentSketchName = null;
        previewImage.setImageDrawable(null);
        previewImage.setVisibility(View.GONE);
        previewPlaceholder.setVisibility(View.VISIBLE);
        startSketchJob(sourceUri, nameHint, null, null, colorStrengthPercent);
    }

    private void rebuildCurrentSketchIfNeeded() {
        if (currentSourceUri == null
                || (currentSketchUri != null && currentStyle == renderedStyle
                && colorStrengthPercent == renderedColorStrength)) {
            return;
        }
        startSketchJob(
                currentSourceUri,
                currentSourceName,
                currentSketchUri,
                currentSketchName,
                colorStrengthPercent);
    }

    private void startSketchJob(
            Uri sourceUri,
            String nameHint,
            Uri replaceUri,
            String replaceName,
            int colorStrength) {
        SketchRenderer.Style style = currentStyle;
        int job = beginBusyState(style == SketchRenderer.Style.PENCIL
                ? "풍경을 연필 스케치로 그리고 있습니다…"
                : "풍경을 수채 스케치로 그리고 있습니다…");
        imageExecutor.execute(() -> buildAndPublishSketch(
                job,
                sourceUri,
                nameHint,
                replaceUri,
                replaceName,
                style,
                colorStrength));
    }

    private void buildAndPublishSketch(
            int job,
            Uri sourceUri,
            String nameHint,
            Uri replaceUri,
            String replaceName,
            SketchRenderer.Style style,
            int colorStrength) {
        Bitmap source = null;
        Bitmap colorSketch = null;
        Uri outputUri = null;
        boolean createdNewFile = false;
        try {
            String sourceName = nameHint == null ? queryDisplayName(sourceUri) : nameHint;
            source = decodeSourceBitmap(sourceUri);
            if (job != activeJob || Thread.currentThread().isInterrupted()) {
                source.recycle();
                return;
            }

            postStatus(job, style == SketchRenderer.Style.PENCIL || colorStrength == 0
                    ? "연필선과 명암을 종이 위에 그리고 있습니다…"
                    : "풍경의 선과 수채화빛 색감을 그리고 있습니다…");
            colorSketch = renderSketchBitmap(source, style, colorStrength);
            source.recycle();
            source = null;
            if (job != activeJob || Thread.currentThread().isInterrupted()) {
                colorSketch.recycle();
                return;
            }

            String sketchName = replaceName == null
                    ? makeSketchName(sourceName)
                    : replaceName;
            if (replaceUri == null) {
                outputUri = saveSketchToPictures(colorSketch, sketchName);
                createdNewFile = true;
            } else {
                replaceSketchInPictures(colorSketch, replaceUri);
                outputUri = replaceUri;
            }
            if (job != activeJob || Thread.currentThread().isInterrupted()) {
                colorSketch.recycle();
                if (createdNewFile) {
                    getContentResolver().delete(outputUri, null, null);
                }
                return;
            }

            Bitmap finishedSketch = colorSketch;
            Uri finishedUri = outputUri;
            String finishedSourceName = sourceName;
            runOnUiThread(() -> {
                if (job != activeJob) {
                    finishedSketch.recycle();
                    return;
                }
                currentSourceName = finishedSourceName;
                currentSketchUri = finishedUri;
                currentSketchName = sketchName;
                renderedColorStrength = colorStrength;
                renderedStyle = style;
                previewImage.setImageBitmap(finishedSketch);
                previewImage.setVisibility(View.VISIBLE);
                previewPlaceholder.setVisibility(View.GONE);
                statusText.setText(style == SketchRenderer.Style.PENCIL || colorStrength == 0
                        ? "흑백 연필 스케치가 완성되었습니다."
                        : "수채화빛 컬러 스케치가 완성되었습니다.");
                statusText.setTextColor(PINE);
                setReadyState(true);
            });
            colorSketch = null;
        } catch (IOException | RuntimeException | OutOfMemoryError error) {
            recycleBitmap(source);
            recycleBitmap(colorSketch);
            if (createdNewFile && outputUri != null) {
                getContentResolver().delete(outputUri, null, null);
            }
            failJob(job, "스케치를 만들지 못했습니다. 다른 사진으로 다시 시도해 주세요.");
        }
    }

    private Bitmap decodeSourceBitmap(Uri sourceUri) throws IOException {
        try {
            ImageDecoder.Source imageSource = isFileUri(sourceUri)
                    ? ImageDecoder.createSource(new File(sourceUri.getPath()))
                    : ImageDecoder.createSource(getContentResolver(), sourceUri);
            return ImageDecoder.decodeBitmap(imageSource, (decoder, info, ignored) -> {
                Size size = info.getSize();
                int longest = Math.max(size.getWidth(), size.getHeight());
                if (longest > MAX_SKETCH_EDGE) {
                    float scale = MAX_SKETCH_EDGE / (float) longest;
                    decoder.setTargetSize(
                            Math.max(1, Math.round(size.getWidth() * scale)),
                            Math.max(1, Math.round(size.getHeight() * scale)));
                }
                decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
                decoder.setMemorySizePolicy(ImageDecoder.MEMORY_POLICY_LOW_RAM);
            });
        } catch (IOException | RuntimeException | OutOfMemoryError firstError) {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            if (isFileUri(sourceUri)) {
                BitmapFactory.decodeFile(sourceUri.getPath(), bounds);
            } else {
                try (ParcelFileDescriptor descriptor =
                             getContentResolver().openFileDescriptor(sourceUri, "r")) {
                    if (descriptor == null) throw new IOException("Image is unavailable");
                    BitmapFactory.decodeFileDescriptor(
                            descriptor.getFileDescriptor(),
                            null,
                            bounds);
                }
            }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
                throw new IOException("Unsupported image format");
            }

            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inPreferredConfig = Bitmap.Config.ARGB_8888;
            options.inSampleSize = 1;
            int longest = Math.max(bounds.outWidth, bounds.outHeight);
            while (longest / options.inSampleSize > MAX_SKETCH_EDGE) {
                options.inSampleSize *= 2;
            }
            Bitmap bitmap;
            if (isFileUri(sourceUri)) {
                bitmap = BitmapFactory.decodeFile(sourceUri.getPath(), options);
            } else {
                try (ParcelFileDescriptor descriptor =
                             getContentResolver().openFileDescriptor(sourceUri, "r")) {
                    if (descriptor == null) throw new IOException("Image is unavailable");
                    bitmap = BitmapFactory.decodeFileDescriptor(
                            descriptor.getFileDescriptor(),
                            null,
                            options);
                }
            }
            if (bitmap == null) throw new IOException("Unsupported image format");
            return bitmap;
        }
    }

    private Bitmap renderSketchBitmap(
            Bitmap source, SketchRenderer.Style style, int colorStrength) {
        int width = source.getWidth();
        int height = source.getHeight();
        int[] original = new int[width * height];
        source.getPixels(original, 0, width, 0, 0, width, height);
        int[] rendered = SketchRenderer.render(original, width, height, style, colorStrength);
        return Bitmap.createBitmap(rendered, width, height, Bitmap.Config.ARGB_8888);
    }

    private Uri saveSketchToPictures(Bitmap sketch, String fileName) throws IOException {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        values.put(
                MediaStore.Images.Media.RELATIVE_PATH,
                Environment.DIRECTORY_PICTURES + "/풍경시/스케치");
        values.put(MediaStore.Images.Media.IS_PENDING, 1);

        Uri destination = getContentResolver().insert(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                values);
        if (destination == null) throw new IOException("No sketch destination");

        try (OutputStream output = getContentResolver().openOutputStream(destination, "w")) {
            if (output == null || !sketch.compress(Bitmap.CompressFormat.JPEG, 94, output)) {
                throw new IOException("Sketch could not be encoded");
            }
            output.flush();
        } catch (IOException | RuntimeException error) {
            getContentResolver().delete(destination, null, null);
            throw error;
        }

        values.clear();
        values.put(MediaStore.Images.Media.IS_PENDING, 0);
        getContentResolver().update(destination, values, null, null);
        return destination;
    }

    private void replaceSketchInPictures(Bitmap sketch, Uri destination) throws IOException {
        try (OutputStream output = getContentResolver().openOutputStream(destination, "w")) {
            if (output == null || !sketch.compress(Bitmap.CompressFormat.JPEG, 94, output)) {
                throw new IOException("Sketch could not be updated");
            }
            output.flush();
        }
    }

    private void copySketchTo(Uri destination) {
        Uri source = currentSketchUri;
        if (source == null) return;

        int job = beginBusyState("스케치를 저장하고 있습니다…");
        imageExecutor.execute(() -> {
            boolean succeeded = false;
            try (InputStream input = getContentResolver().openInputStream(source);
                 OutputStream output = getContentResolver().openOutputStream(destination, "w")) {
                if (input == null || output == null) throw new IOException("Unavailable stream");
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    output.write(buffer, 0, count);
                }
                output.flush();
                succeeded = true;
            } catch (IOException | SecurityException ignored) {
                // A recoverable message is shown below.
            }

            boolean saved = succeeded;
            runOnUiThread(() -> {
                if (job != activeJob) return;
                setReadyState(true);
                if (saved) {
                    statusText.setText(isGoogleDriveUri(destination)
                            ? "스케치를 Google Drive에 저장했습니다."
                            : "스케치를 선택한 위치에 저장했습니다.");
                    statusText.setTextColor(PINE);
                    Toast.makeText(
                            MainActivity.this,
                            "풍경 스케치를 안전하게 저장했습니다.",
                            Toast.LENGTH_LONG).show();
                } else {
                    showError("스케치를 저장하지 못했습니다. 다시 시도해 주세요.");
                }
            });
        });
    }

    private void loadExistingSketch(Uri sketchUri) {
        int job = beginBusyState("저장된 스케치를 불러오고 있습니다…");
        imageExecutor.execute(() -> {
            try {
                Bitmap bitmap = decodeSourceBitmap(sketchUri);
                runOnUiThread(() -> {
                    if (job != activeJob) {
                        bitmap.recycle();
                        return;
                    }
                    previewImage.setImageBitmap(bitmap);
                    previewImage.setVisibility(View.VISIBLE);
                    previewPlaceholder.setVisibility(View.GONE);
                    statusText.setText(renderedStyle == SketchRenderer.Style.PENCIL || renderedColorStrength == 0
                            ? "흑백 연필 스케치가 준비되었습니다."
                            : "컬러 스케치가 준비되었습니다.");
                    statusText.setTextColor(PINE);
                    setReadyState(true);
                });
            } catch (IOException | RuntimeException | OutOfMemoryError error) {
                currentSketchUri = null;
                currentSketchName = null;
                failJob(job, "저장된 스케치를 불러오지 못했습니다. 새로 촬영해 주세요.");
            }
        });
    }

    private int beginBusyState(String message) {
        int job = ++activeJob;
        captureButton.setEnabled(false);
        galleryButton.setEnabled(false);
        saveButton.setEnabled(false);
        colorSeekBar.setEnabled(false);
        pencilChoice.setEnabled(false);
        watercolorChoice.setEnabled(false);
        captureButton.setAlpha(0.5f);
        galleryButton.setAlpha(0.5f);
        saveButton.setAlpha(0.42f);
        colorSeekBar.setAlpha(0.42f);
        statusText.setText(message);
        statusText.setTextColor(MUTED);
        return job;
    }

    private void postStatus(int job, String message) {
        runOnUiThread(() -> {
            if (job != activeJob) return;
            statusText.setText(message);
            statusText.setTextColor(MUTED);
        });
    }

    private void failJob(int job, String message) {
        runOnUiThread(() -> {
            if (job != activeJob) return;
            showError(message);
            setReadyState(currentSketchUri != null);
        });
    }

    private void showError(String message) {
        statusText.setText(message);
        statusText.setTextColor(CLAY);
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    private void setReadyState(boolean hasSketch) {
        captureButton.setEnabled(true);
        galleryButton.setEnabled(true);
        saveButton.setEnabled(hasSketch);
        pencilChoice.setEnabled(true);
        watercolorChoice.setEnabled(true);
        boolean canAdjustColor = hasSketch && currentSourceUri != null
                && currentStyle == SketchRenderer.Style.WATERCOLOR;
        colorSeekBar.setEnabled(canAdjustColor);
        captureButton.setAlpha(1f);
        galleryButton.setAlpha(1f);
        saveButton.setAlpha(hasSketch ? 1f : 0.42f);
        colorSeekBar.setAlpha(canAdjustColor ? 1f : 0.42f);
        if (!hasSketch) {
            previewImage.setImageDrawable(null);
            previewImage.setVisibility(View.GONE);
            previewPlaceholder.setVisibility(View.VISIBLE);
        }
    }

    private void updateColorValue(int progress) {
        if (colorValueText != null) {
            colorValueText.setText(getString(R.string.color_percent, progress));
        }
    }

    private String queryDisplayName(Uri uri) {
        if (isFileUri(uri)) {
            String name = new File(uri.getPath()).getName();
            return name.isEmpty() ? timestampedName("풍경", ".jpg") : name;
        }
        try (Cursor cursor = getContentResolver().query(
                uri,
                new String[]{OpenableColumns.DISPLAY_NAME},
                null,
                null,
                null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (column >= 0) {
                    String name = cursor.getString(column);
                    if (name != null && !name.trim().isEmpty()) return name;
                }
            }
        } catch (RuntimeException ignored) {
            // A timestamped name is used below.
        }
        return timestampedName("풍경", ".jpg");
    }

    private static String makeSketchName(String sourceName) {
        String safeName = sourceName == null ? "풍경" : sourceName;
        int dot = safeName.lastIndexOf('.');
        if (dot > 0) safeName = safeName.substring(0, dot);
        safeName = safeName.replaceAll("[\\\\/:*?\"<>|]", "_");
        return safeName + "_스케치.jpg";
    }

    private static String timestampedName(String prefix, String extension) {
        return prefix + "_" + new SimpleDateFormat(
                "yyyyMMdd_HHmmss",
                Locale.KOREA).format(new Date()) + extension;
    }

    private static boolean isGoogleDriveUri(Uri uri) {
        String authority = uri.getAuthority();
        return authority != null && authority.contains("google.android.apps.docs");
    }

    private static boolean isFileUri(Uri uri) {
        return "file".equalsIgnoreCase(uri.getScheme()) && uri.getPath() != null;
    }

    private void deletePrivateCapture(Uri uri) {
        if (!isFileUri(uri)) return;
        try {
            File pictureRoot = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
            if (pictureRoot == null) return;
            File captureRoot = new File(pictureRoot, "captures").getCanonicalFile();
            File candidate = new File(uri.getPath()).getCanonicalFile();
            String allowedPrefix = captureRoot.getPath() + File.separator;
            if (candidate.getPath().startsWith(allowedPrefix)) {
                candidate.delete();
            }
        } catch (IOException ignored) {
            // Temporary capture cleanup is best-effort only.
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        putUri(outState, STATE_SKETCH_URI, currentSketchUri);
        outState.putString(STATE_SKETCH_NAME, currentSketchName);
        putUri(outState, STATE_SOURCE_URI, currentSourceUri);
        outState.putString(STATE_SOURCE_NAME, currentSourceName);
        outState.putInt(STATE_COLOR_STRENGTH, colorStrengthPercent);
        outState.putInt(STATE_RENDERED_COLOR_STRENGTH, renderedColorStrength);
        outState.putString(STATE_STYLE, currentStyle.name());
        outState.putString(STATE_RENDERED_STYLE, renderedStyle.name());
    }

    @Override
    protected void onDestroy() {
        activeJob++;
        imageExecutor.shutdownNow();
        super.onDestroy();
    }

    private static void putUri(Bundle bundle, String key, Uri uri) {
        if (uri != null) bundle.putString(key, uri.toString());
    }

    private static Uri parseUri(String value) {
        return value == null ? null : Uri.parse(value);
    }

    private static SketchRenderer.Style parseStyle(String value) {
        return "PENCIL".equals(value) ? SketchRenderer.Style.PENCIL : SketchRenderer.Style.WATERCOLOR;
    }


    private static void recycleBitmap(Bitmap bitmap) {
        if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private RadioButton createStyleChoice(String title) {
        RadioButton choice = new RadioButton(this);
        choice.setId(View.generateViewId());
        choice.setText(title);
        choice.setTextSize(14);
        choice.setTextColor(PINE);
        choice.setContentDescription(title);
        return choice;
    }

    private static GradientDrawable roundedDrawable(
            int fillColor,
            int radius,
            int strokeWidth,
            int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fillColor);
        drawable.setCornerRadius(radius);
        if (strokeWidth > 0) drawable.setStroke(strokeWidth, strokeColor);
        return drawable;
    }

    private static LinearLayout.LayoutParams wrapContent() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private static LinearLayout.LayoutParams matchWidthWrap() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private static LinearLayout.LayoutParams matchWidthHeight(int height) {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, height);
    }

    private static FrameLayout.LayoutParams matchParentFrame() {
        return new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT);
    }
}
