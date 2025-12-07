# 💻 CLI Tool

> **Manage your s3db.js database directly from the terminal.**
>
> **Navigation:** [Installation](#-installation) | [Connection](#-connection) | [Commands](#-commands) | [Backup & Restore](#-backup--restore)

---

s3db.js includes a powerful Command Line Interface (CLI) for managing resources, querying data, and performing maintenance tasks like backups.

## 💾 Installation

You can use the CLI directly via `npx` without installation:

```bash
npx s3db help
```

Or install it globally:

```bash
npm install -g s3db.js
# Usage:
s3db help
```

---

## 🔌 Connection

The CLI needs to know how to connect to your bucket. You can provide the connection string in two ways:

### 1. Environment Variable (Recommended)

```bash
export S3DB_CONNECTION="s3://KEY:SECRET@bucket/path"
s3db list
```

### 2. Command Flag

```bash
s3db list --connection "s3://KEY:SECRET@bucket/path"
```

---

## 🛠️ Commands

### `list`
List all resources in the database.

```bash
s3db list
```
**Output:**
```text
┌──────────────┬───────────────┬────────────┬──────────┐
│ Resource     │ Behavior      │ Timestamps │ Paranoid │
├──────────────┼───────────────┼────────────┼──────────┤
│ users        │ enforce-limits│ ✓          │ ✓        │
│ posts        │ body-overflow │ ✓          │ ✗        │
│ logs         │ truncate-data │ ✓          │ ✗        │
└──────────────┴───────────────┴────────────┴──────────┘
```

### `query <resource>`
List records in a resource.

```bash
# List first 10 users
s3db query users

# List 50 items
s3db query users --limit 50

# Output as JSON (for piping)
s3db query users --json > users.json
```

### `get <resource> <id>`
Fetch a single record by ID.

```bash
s3db get users user-123
```

### `insert <resource>`
Insert data into a resource.

```bash
# From JSON string
s3db insert users --data '{"name": "Alice", "email": "alice@example.com"}'

# From file
s3db insert users --file ./new-user.json
```

### `delete <resource> <id>`
Delete a record.

```bash
s3db delete users user-123
```

### `count <resource>`
Count total records in a resource (scans keys).

```bash
s3db count users
```

---

## 📦 Backup & Restore

If you have the **BackupPlugin** installed in your application, the CLI can trigger backups remotely.

### Create Backup

```bash
# Full backup
s3db backup

# Incremental backup
s3db backup --type incremental

# Specific resources only
s3db backup --resources users,posts
```

### List Backups

```bash
s3db backup --list
```

### Restore Backup

```bash
# Restore specific backup
s3db restore backup-2024-01-01-abc

# Overwrite existing data
s3db restore backup-2024-01-01-abc --overwrite
```

---

## 💡 Tips

*   **Piping**: Use `--json` output to pipe data to tools like `jq`.
    ```bash
    s3db query users --json | jq '.[].email'
    ```
*   **LocalStack**: The CLI works with LocalStack connection strings (`http://...`).
*   **Help**: Add `--help` to any command to see options.
