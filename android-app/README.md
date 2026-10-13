# 풍경시 Android 앱

CameraX로 촬영한 사진이나 휴대폰에서 선택한 이미지를 기기 안에서 연필화·수채 스케치로 바꾸는 네이티브 앱입니다. 현재 버전은 1.6.0입니다.

- Android 10(API 29) 이상
- 앱 안의 카메라 촬영과 갤러리 이미지 선택
- `연필 스케치`: 명암, 윤곽선, 해칭, 종이 질감
- `수채 스케치`: 옅은 색면, 부드러운 색 번짐, 연필선, 종이 질감, 가장자리 여백
- 기본 스타일은 수채 스케치, 색감 70%; 0%는 흑백 연필화
- 사진 비율과 전체 구도 유지, 최대 900px로 축소 후 백그라운드 처리
- JPEG 품질 94로 `Pictures/풍경시/스케치`에 저장; 색감·스타일 변경은 같은 파일 갱신
- Android 파일 저장 화면에서 Google Drive를 선택해 완성 이미지를 보관
- ChatGPT 로그인과 네트워크 이미지 생성 없이 사용 가능

참고 스타일: [공유된 스케치 이미지](https://chatgpt.com/share/6acdcbb8-807c-83ee-92c4-ccfa5356c51c). 이미지의 질감을 기기 내 필터로 재현하며 AI처럼 사물을 다시 그리거나 시를 자동으로 추가하는 기능은 포함하지 않습니다.

빌드에는 JDK 17, Android SDK 35, Gradle 8.7이 필요합니다.

`gradle -p android-app lintRelease assembleRelease --no-daemon --offline`로 검증과 릴리스 빌드를 실행합니다. 기존 앱과 동일한 서명 설정을 사용해야 업데이트 설치가 가능합니다.

`SketchRenderer`는 Android에 의존하지 않는 픽셀 처리 코드입니다. `tools/VerifySketchRenderer.java`를 함께 javac로 컴파일하면 색감 0/30/70/100, 원본 보존, 작은 이미지, 투명 이미지, 처리 취소를 검증할 수 있습니다. 두 인수로 원본 이미지 경로와 결과 폴더를 전달하면 미리 보기 PNG도 출력합니다.

풍경 사진 검증에는 Dev Vora의 [Landscape with mountain, forest and lake with reflection](https://commons.wikimedia.org/wiki/File:Landscape_with_mountain,_forest_and_lake_with_reflection.jpg), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 사진을 사용했습니다. 사진을 축소하고 위 필터로 변환한 비교 이미지는 로컬 빌드 도구 폴더에만 있으며 APK에는 포함하지 않습니다.
