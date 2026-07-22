# ChordPilot initial GitHub import

These scripts prepare and publish the first `main` commit without force-pushing or rewriting history. Run them manually, in order, from PowerShell.

The default destination is:

```text
https://github.com/fiuo6/ChordPilot.git
```

## Before starting

1. Create the GitHub repository as an empty public repository. Do not add a README, `.gitignore`, template, or license on GitHub.
2. The `Protect main` ruleset can remain active while preparing and committing locally, but temporarily disable it before the first push.
3. Ensure no secrets, credentials, private audio, or licensed third-party binaries should be included.

## Run the import

From the ChordPilot repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\github\01-prepare-initial-import.ps1
```

The preparation script initializes Git, sets `origin`, stages an explicit allowlist, and stops without committing. Review the proposed import:

```powershell
git status
git diff --cached --name-only
git diff --cached
```

When the staged files are correct:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\github\02-commit-initial-import.ps1
```

Temporarily disable the GitHub ruleset, then publish `main`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\github\03-push-initial-import.ps1
```

Immediately re-enable the `Protect main` ruleset. Finally, verify that local and remote history match:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\github\04-verify-initial-import.ps1
```

Each mutating script prompts for explicit confirmation before committing or pushing. Pass `-Yes` only when intentionally running without prompts.

## After the import

Keep `main` protected. Start future work on a branch:

```powershell
git switch -c feature/short-description
git add <files>
git commit -m "Describe the change"
git push -u origin feature/short-description
```

Open a pull request into `main` and merge it through GitHub.
