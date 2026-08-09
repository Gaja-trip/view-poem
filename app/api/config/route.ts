import {
  getGoogleDriveFolderId,
  getGoogleDriveFolderUrl,
  getRuntimeEnv,
} from "@/lib/runtime-env";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export async function GET() {
  const driveFolderId = getGoogleDriveFolderId();
  const clientId = getRuntimeEnv("GOOGLE_CLIENT_ID") ?? "";
  const pickerApiKey = getRuntimeEnv("GOOGLE_PICKER_API_KEY") ?? "";
  const appId = getRuntimeEnv("GOOGLE_PICKER_APP_ID") ?? "";

  return Response.json(
    {
      aiEnabled: Boolean(getRuntimeEnv("OPENAI_API_KEY")),
      googleDrive: {
        clientId,
        pickerApiKey,
        appId,
        folderId: driveFolderId,
        folderUrl: getGoogleDriveFolderUrl(driveFolderId),
        configured: Boolean(clientId && pickerApiKey && appId && driveFolderId),
      },
    },
    { headers: NO_STORE_HEADERS },
  );
}
