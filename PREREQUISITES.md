# Prerequisites checklist (Windows)

Complete these before starting [PLAN.md](PLAN.md) Phase 1. Steps and commands are written for **Windows** (PowerShell or Command Prompt). Check off each when done.

---

## 1. AWS account

### 1.1 Do I have an AWS account?

- If you can sign in at https://console.aws.amazon.com (with an email and password, or SSO), you have an account.
- If not, go to https://aws.amazon.com and choose **Create an AWS Account**. You’ll need an email, a password, and a payment method (some services are free tier; you won’t be charged without usage beyond free tier).

### 1.2 Am I signed in as the root user or an IAM user?

There are two types of identities you might use to sign in:

| Type | What it is |
|------|------------|
| **Root user** | The single identity that owns the AWS account. Signed up with the account email and password. Has full, unrestricted access. There is only one root user per account. |
| **IAM user** | A user created inside the account (by you or an admin). Has only the permissions you attach. Used for day-to-day work and for the CLI. |

**How to check in the AWS Console:**

1. Sign in to https://console.aws.amazon.com.
2. Click your **account name** (or “Account”) in the **top-right** of the header.
3. In the dropdown:
   - If you see **“Root user”** or your **account ID** and the email you used to create the account → you are the **root user**.
   - If you see a **user name** (e.g. `john-dev`) and/or **“Switch role”** / **“IAM user”** → you are an **IAM user**.

**How to check with the AWS CLI** (after `aws configure`):

In **PowerShell** or **Command Prompt**:

```powershell
aws sts get-caller-identity
```

Look at the **`Arn`** in the output:

- **`arn:aws:iam::123456789012:root`** → you are using the **root user** (root identity, not an IAM user).
- **`arn:aws:iam::123456789012:user/YourUserName`** → you are an **IAM user** named `YourUserName`.

**Why it matters:** The root user has no permission limits and should be used only for rare account-level tasks (e.g. changing the root email, closing the account). For development and CLI use, AWS recommends creating an **IAM user** and using that instead. If you’re currently root, follow the steps below to create an IAM user and use it for this project.

### 1.3 Steps to set up the account for this project

**Option A – You are okay using the root user for now (simplest, not recommended long term)**

1. Ensure you can sign in to the Console as root.
2. You already have full permissions; no extra setup for permissions.
3. For the CLI (later): create **access keys for the root user** in Console → account menu (top-right) → **Security credentials** → **Access keys** → Create access key. Use these only if you don’t create an IAM user; prefer Option B.

**Option B – Use an IAM user (recommended)**

1. **Sign in as root** (or as an IAM user that already has permission to create IAM users).
2. Open **IAM**: in the Console search bar, type **IAM** and open **IAM** (Identity and Access Management).
3. In the left menu, click **Users** → **Create user**.
4. **User name**: e.g. `cloudviewer-dev` (or any name you like). Click **Next**.
5. **Permissions**: choose **Attach policies directly** and select **AdministratorAccess** (full access for development). Click **Next** (you can restrict this later with a custom policy if you want).
6. Click **Next** through the rest, then **Create user**.
7. **Create access keys for CLI**:
   - Open the new user → **Security credentials** tab.
   - Under **Access keys**, click **Create access key**.
   - Choose **Command Line Interface (CLI)**; confirm the box and click **Next** → **Create access key**.
   - Copy the **Access key ID** and **Secret access key** (you’ll use these in `aws configure` in Section 3). Store the secret key somewhere safe; you won’t see it again.
8. **Sign in as this IAM user** (optional, for Console):
   - In IAM → **Users** → your user → **Security credentials** tab.
   - Under **Console sign-in**, if there’s a link like “Assign console password”, set a password.
   - Sign out of the root (account menu → Sign out), then sign in using the **IAM user sign-in URL**:  
     `https://YOUR-ACCOUNT-ID.signin.aws.amazon.com/console`  
     (Find YOUR-ACCOUNT-ID in the account menu when signed in as root: it’s the 12-digit number.)
   - Or keep using root for the Console and use the IAM user only for the CLI (via the access keys).

**Checklist:**

- [x] I can sign in to the AWS Console.
- [x] I know whether I’m root or an IAM user (Console or `aws sts get-caller-identity`).
- [x] I have an IAM user for this project (recommended) or I’m using root with access keys for the CLI.
- [x] That identity has sufficient permissions (e.g. AdministratorAccess for the IAM user, or root).
- [x] (When you set up the CLI) I have the access key ID and secret key for the identity I will use.

**Status: AWS account prerequisite completed.**

---

## 2. Node.js and npm

CDK and the app use TypeScript and Node. You need a current **LTS** version of Node (e.g. 20.x or 22.x).

**Check (PowerShell or Command Prompt):**

```powershell
node -v
npm -v
```

You should see something like `v20.x.x` or `v22.x.x` for Node, and `9.x.x` or `10.x.x` for npm.

**If missing – install on Windows:**

1. Go to https://nodejs.org/ and download the **LTS** version (Windows Installer `.msi`).
2. Run the installer. On the “Tools for Native Modules” screen you can leave the default (no need to install build tools unless you need native addons).
3. Ensure **“Add to PATH”** is checked (it usually is by default). Finish the install.
4. **Close and reopen** your terminal (PowerShell, Command Prompt, or Cursor’s integrated terminal) so the updated PATH is picked up.
5. Run `node -v` and `npm -v` again in the new terminal.

**If `node` or `npm` is not recognized** after install, the PATH may not include the Node folder. Restart Cursor/VS Code completely, or log out and back in to Windows. You can also add it manually: typically `C:\Program Files\nodejs\`.

- [x] `node -v` shows an LTS version (or current, e.g. v24.x — fine for CDK and TypeScript)
- [x] `npm -v` works

**Status: Node.js and npm prerequisite completed.**

---

## 3. AWS CLI configured

The CLI must be installed and configured with credentials for the account/region you will deploy to.

**Check (PowerShell or Command Prompt):**

```powershell
aws --version
aws sts get-caller-identity
aws configure list
```

- `get-caller-identity` should return your account ID, user ARN, and user id.
- `configure list` should show a region (e.g. `us-east-1`).

**If AWS CLI is not installed – Windows:**

1. Go to https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html and use the **Windows** instructions.
2. **Option A (recommended):** Download and run the **MSI installer** for your architecture (64-bit: “AWS CLI MSI installer for Windows 64-bit”). Run the installer and accept the defaults.
3. **Option B:** Install via Microsoft MSI from the same page if you prefer.
4. **Close and reopen** your terminal so `aws` is on PATH.
5. Run `aws --version` to confirm.

**If installed but not configured (or you need to set credentials):**

```powershell
aws configure
```

Enter when prompted:

- **AWS Access Key ID**: (from IAM → your user → Security credentials → Create access key)
- **AWS Secret Access Key**: (from the same place; store it safely)
- **Default region name**: e.g. `us-east-1`
- **Default output format**: you can leave blank or use `json`

Create access keys in the AWS Console: IAM → Users → your user → Security credentials → Create access key (use for CLI).

- [x] `aws --version` works
- [x] `aws sts get-caller-identity` succeeds (run after `aws configure` with your access key and secret)
- [x] Default region is set and correct for your deploy

**Status: AWS CLI prerequisite completed.**

---

## 4. GitHub repo

You need a GitHub repository for this project. The pipeline (Phase 2) will pull from it. **Git must be installed first** (see Section 5).

### 4.1 Create the repo on GitHub

1. Sign in to **GitHub** (https://github.com).
2. Click the **+** in the top-right → **New repository** (or go to https://github.com/new).
3. **Repository name:** `health-analytics-cloudviewer` (or another name; no spaces).
4. **Description:** optional (e.g. “Serverless file upload app (CDK)”).
5. **Public** or **Private:** your choice; the pipeline will connect via CodeStar Connection either way.
6. **Do not** check “Add a README file”, “Add .gitignore”, or “Choose a license” if you already have a local folder with project files — you’ll push that content. If the folder is empty, you can add a README so GitHub shows something.
7. Click **Create repository**.

GitHub will show a page with setup commands. You’ll use the repo URL (e.g. `https://github.com/YourUsername/health-analytics-cloudviewer.git` or `git@github.com:YourUsername/health-analytics-cloudviewer.git`) in the next step.

### 4.2 Connect your local project to the repo

Run these in **PowerShell** or **Command Prompt** from your **project folder** (e.g. `d:\Google Drive\Health\Analyses\CloudViewer.project`).

**If this folder is not yet a Git repo:**

```powershell
git init
```

**Add the GitHub repo as the remote** (replace `YourUsername` with your GitHub username):

```powershell
git remote add origin https://github.com/YourUsername/health-analytics-cloudviewer.git
```

If you use SSH instead of HTTPS, use:

```powershell
git remote add origin git@github.com:YourUsername/health-analytics-cloudviewer.git
```

**If the folder is already a Git repo** and you already have a remote you want to replace:

```powershell
git remote remove origin
git remote add origin https://github.com/YourUsername/health-analytics-cloudviewer.git
```

**Ensure you have a main branch and push** (create an initial commit if the folder has no commits yet):

```powershell
git add .
git status
```

Check that **no secrets or credentials** are listed (no `.aws/`, no files with keys). Add a `.gitignore` if needed (e.g. `node_modules/`, `cdk.out/`, `.env`). Then:

```powershell
git commit -m "Initial commit: CloudViewer project and proposal"
git branch -M main
git push -u origin main
```

If GitHub prompts for sign-in, use your GitHub username and a **Personal Access Token** (not your password) for HTTPS, or ensure SSH keys are set up for SSH. Create a token at GitHub → Settings → Developer settings → Personal access tokens.

### 4.3 Checklist

- [ ] GitHub repo created (Section 4.1)
- [ ] Local project folder is a Git repo and `origin` points to the GitHub repo (Section 4.2)
- [ ] Initial code pushed to `main` (or your chosen branch); pipeline will use this branch in Phase 2

**For Phase 1** you can work locally without a remote. **For Phase 2** the code must be in this GitHub repo and the pipeline will pull from the branch you configured.

---

## 5. Git (required for GitHub)

You need Git installed to push to GitHub and for the pipeline to work. For Phase 1 you need it if you set up the repo now; for Phase 2 it’s required.

**Check (PowerShell or Command Prompt):**

```powershell
git --version
```

You should see something like `git version 2.43.0.windows.1`.

**If missing – Windows:** Install **Git for Windows** from https://git-scm.com/download/win. Use the default options (including “Git from the command line and also from 3rd-party software” so `git` is on PATH). Restart the terminal after install.

- [ ] Git is installed

---

## Quick verify (copy-paste)

In **PowerShell** or **Command Prompt**, run each line (or run as a block in PowerShell; in cmd use `&` or run one by one):

```powershell
node -v
npm -v
git --version
aws sts get-caller-identity
```

If all succeed (Node and npm show versions, git shows version, AWS returns account/user info), you’re set.  
*Note: In Windows PowerShell 5.1, `&&` doesn’t work between commands; use separate lines or a semicolon: `node -v; npm -v; git --version; aws sts get-caller-identity`.*

When all items above are checked, you’re ready to start **Phase 1** of [PLAN.md](PLAN.md).
