#include <windows.h>
#include <shlwapi.h>
#pragma comment(lib, "shlwapi.lib")

/* Returns non-zero when the file (or dir) exists under the given directory. */
static int dirHas(const char* dir, const char* rel) {
  char probe[MAX_PATH];
  wsprintfA(probe, "%s\\%s", dir, rel);
  return GetFileAttributesA(probe) != INVALID_FILE_ATTRIBUTES;
}

int WINAPI WinMain(HINSTANCE h, HINSTANCE p, LPSTR cmd, int n) {
  char exe[MAX_PATH], dir[MAX_PATH], node[MAX_PATH], script[MAX_PATH], webRoot[MAX_PATH], args[3 * MAX_PATH];
  GetModuleFileNameA(NULL, exe, MAX_PATH);
  lstrcpyA(dir, exe);
  PathRemoveFileSpecA(dir);

  /* Self-contained layout: this exe, node.exe, server.cjs and dist live together. */
  if (!dirHas(dir, "node.exe") || !dirHas(dir, "server.cjs") || !dirHas(dir, "dist\\index.html")) {
    MessageBoxA(NULL, "Game files not found. Keep node.exe, server.cjs and the dist folder next to this launcher.",
                "GameLauncher", MB_ICONERROR);
    return 1;
  }
  wsprintfA(webRoot, "%s\\dist", dir);
  wsprintfA(node, "%s\\node.exe", dir);
  wsprintfA(script, "%s\\server.cjs", dir);
  wsprintfA(args, "\"%s\" \"%s\" \"%s\"", node, script, webRoot);

  STARTUPINFOA si;
  PROCESS_INFORMATION pi;
  ZeroMemory(&si, sizeof(si));
  si.cb = sizeof(si);
  ZeroMemory(&pi, sizeof(pi));
  si.dwFlags = STARTF_USESHOWWINDOW;
  si.wShowWindow = SW_HIDE;
  if (!CreateProcessA(NULL, args, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, dir, &si, &pi)) {
    MessageBoxA(NULL, "Failed to start node.exe. The game files may be incomplete.", "GameLauncher", MB_ICONERROR);
    return 1;
  }
  CloseHandle(pi.hThread);
  CloseHandle(pi.hProcess);
  return 0;
}
