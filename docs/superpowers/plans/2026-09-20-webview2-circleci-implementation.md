# Non-Unity WebView2 and CircleCI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all Unity implementation and release machinery while preserving the Web game, delivering it through a hardened WebView2 Windows application, and validating it with CircleCI.

**Architecture:** `src/` remains the single game implementation and Vite produces `dist/` for both browsers and the desktop shell. The .NET 8 WinForms launcher maps `dist/` to a private HTTPS virtual host in WebView2 and accepts navigation only within that origin. CircleCI validates the Web application on every branch and packages the Windows application only for `v*` tags.

**Tech Stack:** TypeScript, Vite, Phaser, Preact, Vitest, Playwright, .NET 8 WinForms, Microsoft WebView2, PowerShell, Inno Setup, CircleCI 2.1

**Spec:** `docs/superpowers/specs/2026-09-20-webview2-circleci-design.md`

## Global Constraints

- The browser game in `src/` is the sole source of gameplay behavior and content.
- Remove all Unity source, generated state, documentation, scripts, packaging, and active references.
- Windows delivery is self-contained `win-x64`; users do not need a separate .NET installation.
- The Windows shell requires Microsoft Edge WebView2 Runtime and must show a Chinese error if it is unavailable.
- The desktop shell must deny navigation outside its packaged application origin.
- CircleCI must not run the Windows executor for ordinary branch builds.
- Do not add secrets or automatic GitHub Release publishing.

---

### Task 1: Establish the Web Baseline and Remove Unity

**Files:**
- Create: `scripts/check-no-unity.mjs`
- Modify: `package.json`
- Modify: `.gitignore`
- Delete: `unity/`
- Delete: `docs/unity-migration-plan.md`
- Delete: `docs/unity-testing.md`
- Delete: `scripts/export-unity-parity.mjs`
- Delete: `scripts/package-unity-windows.ps1`
- Delete: `scripts/sync-unity-ui-assets.mjs`
- Delete: `scripts/test-unity.ps1`
- Delete: `installer/roguelike-unity.iss`
- Delete: `test-results/` files whose names begin with `unity-`

**Interfaces:**
- Consumes: existing npm scripts `content:check`, `test`, `lint`, and `build`
- Produces: npm script `check:no-unity`, which exits zero only when active Unity paths and package scripts are absent

- [ ] **Step 1: Record the pre-change Web baseline**

Run:

```powershell
npm run content:check
npm test
npm run lint
npm run build
```

Expected: every command exits `0`; record existing failures before deleting anything.

- [ ] **Step 2: Add a repository-boundary check that initially fails**

Create `scripts/check-no-unity.mjs`:

```js
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const forbiddenPaths = [
  'unity',
  'docs/unity-migration-plan.md',
  'docs/unity-testing.md',
  'installer/roguelike-unity.iss',
  'scripts/export-unity-parity.mjs',
  'scripts/package-unity-windows.ps1',
  'scripts/sync-unity-ui-assets.mjs',
  'scripts/test-unity.ps1',
];

const existing = [];
for (const path of forbiddenPaths) {
  try {
    await access(resolve(root, path), constants.F_OK);
    existing.push(path);
  } catch {}
}

const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const unityScripts = Object.keys(pkg.scripts ?? {}).filter((name) => name.includes('unity'));
if (existing.length || unityScripts.length) {
  console.error(`Unity remnants found: ${[...existing, ...unityScripts].join(', ')}`);
  process.exit(1);
}
console.log('No active Unity project or tooling remains.');
```

Add `"check:no-unity": "node scripts/check-no-unity.mjs"` to `package.json`.

- [ ] **Step 3: Run the boundary check and verify the red state**

Run: `npm run check:no-unity`

Expected: FAIL and list `unity` plus the Unity-only scripts and documents.

- [ ] **Step 4: Delete the resolved Unity targets safely**

Delete only the paths listed in this task. Resolve `D:\lz\lz\project\rougulike\unity` before recursively removing it and verify that the resolved path is exactly beneath `D:\lz\lz\project\rougulike`. Remove Unity-only generated reports from `test-results/`; do not remove Web or Playwright results.

Remove `package:unity:windows` from `package.json`. Remove only `unity/...` patterns from `.gitignore`.

- [ ] **Step 5: Verify the green state and Web regression boundary**

Run:

```powershell
npm run check:no-unity
npm run content:check
npm test
npm run lint
npm run build
rg -n -i --glob '!docs/superpowers/**' --glob '!node_modules/**' --glob '!dist/**' --glob '!release/**' "unity|package:unity|test-unity|export-unity-parity" .
```

Expected: the boundary check and all Web commands pass; `rg` prints no active references.

- [ ] **Step 6: Commit the Unity removal**

```powershell
git add -A unity docs/unity-migration-plan.md docs/unity-testing.md scripts installer/roguelike-unity.iss package.json .gitignore
git commit -m "refactor: remove Unity implementation"
```

### Task 2: Make WebView2 the Canonical Windows Carrier

**Files:**
- Create: `launcher/NavigationPolicy.cs`
- Create: `launcher/checks/LauncherChecks.csproj`
- Create: `launcher/checks/Program.cs`
- Modify: `launcher/Program.cs`
- Modify: `launcher/GameLauncher.csproj`
- Modify: `scripts/package-windows.ps1`
- Modify: `.gitignore`
- Delete: `launcher/obj/` tracked files
- Delete: `launcher/bin/` generated files
- Delete: `launcher/launcher.c`
- Delete: `launcher/launcher.rc`
- Delete: `launcher/launcher-res.o`
- Delete: `launcher/server.cjs`
- Delete: `launcher/launch.bat`
- Delete: `scripts/package-portable.ps1`
- Delete: `server.cjs`
- Delete: `node.exe`
- Delete: `GameLauncher.exe`

**Interfaces:**
- Produces: `NavigationPolicy.IsAllowed(Uri? uri, string applicationOrigin): bool`
- Produces: desktop origin `https://app.local/` backed by the packaged `dist/` directory
- Produces: npm script `package:windows` as the sole Windows packaging entrypoint

- [ ] **Step 1: Write the failing navigation-policy checks**

Create `launcher/checks/LauncherChecks.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="..\NavigationPolicy.cs" Link="NavigationPolicy.cs" />
  </ItemGroup>
</Project>
```

Create `launcher/checks/Program.cs`:

```csharp
const string Origin = "https://app.local/";
var cases = new[]
{
    (new Uri("https://app.local/"), true),
    (new Uri("https://app.local/assets/game.js"), true),
    (new Uri("https://app.local.evil.example/"), false),
    (new Uri("https://example.com/"), false),
    (new Uri("file:///C:/Windows/System32/drivers/etc/hosts"), false),
};
foreach (var (uri, expected) in cases)
{
    if (NavigationPolicy.IsAllowed(uri, Origin) != expected)
        throw new InvalidOperationException($"Unexpected navigation result for {uri}");
}
Console.WriteLine("Launcher navigation checks passed.");
```

- [ ] **Step 2: Run the checks and verify they fail**

Run: `dotnet run --project launcher/checks/LauncherChecks.csproj`

Expected: FAIL because `launcher/NavigationPolicy.cs` does not exist.

- [ ] **Step 3: Implement the navigation policy**

Create `launcher/NavigationPolicy.cs`:

```csharp
internal static class NavigationPolicy
{
    internal static bool IsAllowed(Uri? uri, string applicationOrigin)
    {
        if (uri is null || !Uri.TryCreate(applicationOrigin, UriKind.Absolute, out var origin)) return false;
        return uri.Scheme == origin.Scheme &&
               uri.Host.Equals(origin.Host, StringComparison.OrdinalIgnoreCase) &&
               uri.Port == origin.Port;
    }
}
```

Update `launcher/Program.cs` to map the `dist` directory with `CoreWebView2HostResourceAccessKind.DenyCors`, navigate to `https://app.local/index.html`, and cancel `NavigationStarting` requests when `NavigationPolicy.IsAllowed` returns false. Keep the existing Chinese missing-file and missing-runtime errors.

Exclude `checks/**/*.cs` from the launcher compilation in `GameLauncher.csproj`:

```xml
<ItemGroup>
  <Compile Remove="checks\**\*.cs" />
  <None Include="checks\**\*" />
</ItemGroup>
```

- [ ] **Step 4: Run policy and launcher compilation checks**

Run:

```powershell
dotnet run --project launcher/checks/LauncherChecks.csproj
dotnet build launcher/GameLauncher.csproj -c Release
```

Expected: both commands exit `0`.

- [ ] **Step 5: Remove the obsolete Node/GCC carrier and tracked build products**

Remove the legacy paths listed in this task. Add these rules to `.gitignore`:

```gitignore
launcher/bin/
launcher/obj/
launcher/checks/bin/
launcher/checks/obj/
GameLauncher.exe
node.exe
```

Remove `package:portable` from `package.json`. Keep `package:windows`.

- [ ] **Step 6: Make packaging verify the produced staging layout**

After copying `dist` in `scripts/package-windows.ps1`, add checks that `GameLauncher.exe`, `dist/index.html`, and at least one `dist/assets/*` file exist. Throw a path-specific error when a required output is missing. Keep the current test, lint, build, self-contained publish, and optional Inno Setup behavior.

- [ ] **Step 7: Build the Web and Windows staging directory**

Run: `npm run package:windows`

Expected: Web checks pass and `release/stage-<package version>/GameLauncher.exe` plus `dist/index.html` exist. If Inno Setup is unavailable, the script must exit successfully after warning and leave the runnable staging directory.

- [ ] **Step 8: Commit the desktop carrier**

```powershell
git add -A launcher scripts/package-portable.ps1 scripts/package-windows.ps1 server.cjs node.exe GameLauncher.exe package.json .gitignore
git commit -m "feat: make WebView2 the Windows game carrier"
```

### Task 3: Add CircleCI Validation and Tagged Windows Packaging

**Files:**
- Create: `.circleci/config.yml`
- Delete: `.github/workflows/windows-release.yml`

**Interfaces:**
- Produces: CircleCI job `web-verify`
- Produces: CircleCI job `windows-package`, triggered only by tags matching `v*`
- Consumes: npm scripts `check:no-unity`, `content:check`, `test`, `lint`, `build`, and `package:windows`

- [ ] **Step 1: Create the CircleCI configuration**

Create `.circleci/config.yml`:

```yaml
version: 2.1

orbs:
  win: circleci/windows@5.0.0

jobs:
  web-verify:
    docker:
      - image: cimg/node:22.14.0
    steps:
      - checkout
      - restore_cache:
          keys:
            - v1-npm-node22-{{ checksum "package-lock.json" }}
      - run:
          name: Install dependencies
          command: npm ci
      - save_cache:
          key: v1-npm-node22-{{ checksum "package-lock.json" }}
          paths:
            - ~/.npm
      - run: npm run check:no-unity
      - run: npm run content:check
      - run: npm test
      - run: npm run lint
      - run: npm run build
      - store_artifacts:
          path: dist
          destination: web-dist

  windows-package:
    executor:
      name: win/default
      size: medium
    steps:
      - checkout
      - run:
          name: Verify Windows toolchain
          command: |
            node --version
            dotnet --version
      - run:
          name: Install Inno Setup
          command: choco install innosetup --yes --no-progress
      - run:
          name: Install dependencies
          command: npm ci
      - run:
          name: Build Windows package
          command: npm run package:windows
      - store_artifacts:
          path: release
          destination: windows-release

workflows:
  verify-and-package:
    jobs:
      - web-verify:
          filters:
            tags:
              only: /^v.*/
      - windows-package:
          requires:
            - web-verify
          filters:
            branches:
              ignore: /.*/
            tags:
              only: /^v.*/
```

- [ ] **Step 2: Remove the duplicate GitHub Actions release workflow**

Delete `.github/workflows/windows-release.yml`. Leave `.github/` in place if other files exist.

- [ ] **Step 3: Validate the configuration locally**

Run:

```powershell
circleci config validate .circleci/config.yml
```

Expected: `Config file at .circleci/config.yml is valid.` If the CircleCI CLI is unavailable, parse the YAML with an available local parser and explicitly record that authoritative remote validation remains pending.

- [ ] **Step 4: Re-run the commands represented by CircleCI**

Run:

```powershell
npm ci
npm run check:no-unity
npm run content:check
npm test
npm run lint
npm run build
dotnet run --project launcher/checks/LauncherChecks.csproj
```

Expected: every command exits `0`.

- [ ] **Step 5: Commit CircleCI**

```powershell
git add .circleci/config.yml .github/workflows/windows-release.yml
git commit -m "ci: add CircleCI web and Windows pipelines"
```

### Task 4: Rewrite User Documentation and Perform Final Acceptance

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-09-20-webview2-circleci-implementation.md`

**Interfaces:**
- Consumes: the final npm, desktop, and CircleCI commands
- Produces: player/developer instructions that describe only the Web and WebView2 deliverables

- [ ] **Step 1: Rewrite README delivery instructions**

Keep the concise game overview and gameplay content. Replace Unity sections with:

- browser development: `npm install`, `npm run dev`
- browser validation: `npm run content:check`, `npm test`, `npm run lint`, `npm run build`
- Windows packaging: prerequisites for Node.js, .NET 8 SDK, optional Inno Setup, then `npm run package:windows`
- direct staging output and installer output paths
- architecture statement that browser and Windows use the same Web game implementation
- CircleCI behavior for branches and `v*` tags

- [ ] **Step 2: Perform complete automated acceptance**

Run:

```powershell
npm run check:no-unity
npm run content:check
npm test
npm run lint
npm run build
dotnet run --project launcher/checks/LauncherChecks.csproj
dotnet publish launcher/GameLauncher.csproj -c Release -r win-x64 --self-contained true -p:Version=0.1.0 -o release/final-verification
git diff --check
git status --short
```

Expected: all commands pass and `release/final-verification/GameLauncher.exe` exists. Copy the current `dist` in the next step before launch verification.

- [ ] **Step 3: Smoke-test the desktop executable**

Copy `dist/` to `release/final-verification/dist`, launch `release/final-verification/GameLauncher.exe`, verify the main menu appears, and close only the process started by this task. If GUI launch permission is unavailable, report desktop rendering as unverified rather than inferring success from compilation.

- [ ] **Step 4: Confirm cleanup boundaries**

Run:

```powershell
rg -n -i --glob '!docs/superpowers/**' --glob '!node_modules/**' --glob '!dist/**' --glob '!release/**' "unity|package:unity|test-unity|export-unity-parity" .
git status --short --ignored
```

Expected: no active Unity references; ignored output is limited to expected dependency, build, test, and release directories.

- [ ] **Step 5: Record completed checkboxes and commit documentation**

Mark executed plan steps complete only where evidence exists, then run:

```powershell
git add README.md docs/superpowers/plans/2026-09-20-webview2-circleci-implementation.md
git commit -m "docs: document Web and desktop delivery"
```
