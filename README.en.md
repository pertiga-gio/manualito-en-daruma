# 📋 Manualito en Daruma

**Web tool for searching and querying job function manuals — Santiago de Cali Mayor's Office**

🔗 **Daruma Portal (public access)**: https://sig.cali.gov.co/app.php/staff/portal/tab/16

Deployed in **April 2026**, "Manualito en Daruma" simplifies the search for documents — specifically job function description sheets (fichas de descripción de funciones) — within the **Daruma Portal** module of the SIG (Integrated Management System) of the Santiago de Cali Mayor's Office.

![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Google%20Apps%20Script-orange)
![Status](https://img.shields.io/badge/status-production-success)
![Language](https://img.shields.io/badge/language-JavaScript-yellow)
![Web Scraping](https://img.shields.io/badge/tech-web%20scraping-red)

<!-- SCREENSHOTS -->
![Dashboard — search with filters](docs/screenshot-dashboard.png)

*Main dashboard: combined filters (Level, Job Title, Code, Grade, Department/Area) + quick search. Table with 10+ results and "📄 View in Daruma" button linking to original documents.*

![Filtered search — "talento"](docs/screenshot-busqueda.png)

*Free-text quick search filter applied. The table updates in real-time showing only matching records.*

---

## 🎯 Problem

The **Daruma Portal** module of the Santiago de Cali Mayor's Office SIG system allows querying job function description sheets for public positions, but:

- **No advanced search**: only manual navigation through extensive lists
- **No combined filters** (by code, grade, department, area, purpose)
- **Fields like "Current Decree" and "Job Level" are not form fields** — they are embedded in each sheet's HTML, not exposed via the API

The result: finding a specific job functions manual required opening each sheet one by one.

## ✅ Solution

"Manualito en Daruma" is a **web app built on Google Apps Script** that:

1. **Automatically inventories** all job function manuals via scraping
2. **Extracts fields not available in the API** (current decree, level, functional area, purpose) directly from each sheet's HTML
3. **Exposes a search interface** with combined filters and free-text quick search
4. **Updates daily at 4:00 AM** automatically and incrementally

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│              Google Spreadsheet                  │
│  ┌──────────┐    ┌──────────────────────────┐  │
│  │ "Datos"   │    │ "Informe" Sheet           │  │
│  │ Sheet     │    │ (28 columns + URL)        │  │
│  │ (API)     │    │ (API + HTML Scraping)     │  │
│  └────┬─────┘    └──────────┬───────────────┘  │
│       │                     │                   │
│       ▼                     ▼                   │
│  ┌────────────────────────────────────────┐    │
│  │     Apps Script (Code.gs + Index.html) │    │
│  │  • Scraping script (batch/concurrent)   │    │
│  │  • Web App doGet() → Index.html        │    │
│  │  • Daily trigger 4:00 AM               │    │
│  └────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│       Web Interface (Index.html)                 │
│  • Quick search (free text)                      │
│  • Filters: Level, Job Title, Code,               │
│    Grade, Department/Area, Purpose                │
│  • Table with up to 500 results                  │
│  • Direct link to each sheet in Daruma           │
└─────────────────────────────────────────────────┘
```

## 🔧 How It Works

### 1. SIG Cali API Synchronization

The script queries the official SIG API (`sig.cali.gov.co/api.php/staff/v2/QueryManualFunciones`) to retrieve the complete inventory of job function manuals. Data is stored in the spreadsheet's **"Datos"** sheet.

### 2. Web Scraping of Each Sheet

Many important fields (**Current Decree**, **Level**, **Functional Area**, **Main Purpose**, **Functions**, **Basic Knowledge**) **are not available via the API** — they are embedded in each sheet's HTML on Daruma.

The script **fetches each sheet's HTML via HTTP**, parses it with regular expressions, and extracts these fields. To avoid Apps Script timeouts:

- **Batch processing** of 40 sheets (`BATCH_SIZE = 40`)
- **Concurrency** of 5 simultaneous requests (`CONCURRENCY = 5`)
- **Chained triggers** (`timeBased().after(3000)`) that re-execute the function every 3 seconds without exhausting Apps Script's execution limit
- **Retry with exponential backoff** for 502/504 errors
- **Incremental updates**: only scrapes new or modified sheets (compares `fecha_de_modificacion`)

### 3. Web App (Frontend)

Deployed as a **Google Apps Script Web App** (`doGet()` → `Index.html`). The interface:

- Loads cached data from the "Informe" sheet via `google.script.run`
- Filters by **Level, Job Title, Code, Grade, Department/Area**
- **Free-text quick search** (searches across all fields simultaneously)
- Table with up to 500 results and direct links to each sheet in Daruma

### 4. Automatic Updates

A **daily trigger at 4:00 AM** runs `ejecutarProcesoAutomatico()`:

1. Synchronizes the "Datos" sheet with the API
2. Compares modification dates vs. the "Informe" sheet
3. Only scrapes new or modified sheets (incremental)
4. If processing exceeds the execution limit, it resumes via chained triggers

## 📁 Repository Structure

```
manualito-en-daruma/
├── README.md
├── README.en.md
├── LICENSE
├── .gitignore
├── src/
│   └── apps-script/
│       ├── Code.gs          # Full script (scraping + web app)
│       └── Index.html       # Web app frontend
└── docs/
    ├── arquitectura.md       # Technical details (Spanish)
    ├── screenshot-dashboard.png
    └── screenshot-busqueda.png
```

## 🚀 Deployment

### Requirements

- Google Workspace account with Apps Script access
- Google Spreadsheet with two sheets: **"Datos"** and **"Informe"**
- Access to the SIG Cali API (oauth_token)
- The system must be running on the `sig.cali.gov.co` domain

### Steps

1. **Create the spreadsheet** in Google Sheets
2. **Open Apps Script** (Extensions → Apps Script)
3. **Copy the code**:
   - Paste `Code.gs` into the editor
   - Create an HTML file `Index.html` and paste the frontend
4. **Configure credentials**:
   - Replace `YOUR_SPREADSHEET_ID` in `Code.gs`
   - Replace `YOUR_TOKEN` with the SIG Cali oauth_token
5. **Create the daily trigger**:
   - Apps Script → Triggers → Add Trigger
   - Function: `ejecutarProcesoAutomatico`
   - Event: Time-driven → Day timer → 4am
6. **Deploy as Web App**:
   - Deploy → New Deployment → Web app
   - Execute as: Me
   - Who has access: Anyone within the organization
7. **Share the web app link** with users

### Custom Menu

The script adds a **⚙️ SIG CALI** menu to the spreadsheet with:
- **🔄 Daily Update (Incremental)**: updates only new/modified sheets
- **🔥 Refresh ALL (Forced)**: clears and regenerates everything from scratch

## 🔍 Extracted Fields

| Field | Source | Method |
|-------|--------|--------|
| Index, codigo_ficha, Area, Proceso, Date Modified | SIG Cali API | JSON → "Datos" sheet |
| Level | Sheet HTML | Regex: `Nivel:\s*([A-ZÁÉÍÓÚÑ]+)` |
| Current Decree | Sheet HTML | Regex: `Decreto vigente:\s*(.*?)\s*Página:` |
| Job Title | Sheet HTML | Regex |
| Code, Grade | Sheet HTML | Regex |
| Position Nature | Sheet HTML | Regex |
| Department, Immediate Supervisor | Sheet HTML | Regex |
| Functional Area, Process | Sheet HTML | Roman numeral line parser |
| Main Purpose, Functions | Sheet HTML | Regex with roman numeral delimiters |
| Basic Knowledge | Sheet HTML | Regex |
| Common, By Hierarchical Level | HTML tables | `<tr>/<td>` parser |
| Academic Formation, Experience | HTML tables | `<tr>/<td>` parser |
| Alt. Formation, Alt. Experience | HTML tables | `<tr>/<td>` parser |
| URL | Constructed | `https://sig.cali.gov.co/app.php/staff/document/viewPublic?index=${id}` |

## 🛠️ Tech Stack

- **Google Apps Script** (backend, scraping, web app)
- **Google Sheets** (data storage)
- **HTML/CSS/JavaScript** (frontend, vanilla)
- **SIG Cali API** (primary data source)
- **Web scraping** (secondary data source: fields not available via the API)

## 📊 Features

- ✅ Instant free-text search
- ✅ Combined filters (level, job title, code, grade, department/area)
- ✅ Incremental updates (only new/modified sheets)
- ✅ Concurrent processing (5 simultaneous requests)
- ✅ Automatic retries with exponential backoff
- ✅ Daily automatic trigger (4:00 AM)
- ✅ Responsive (mobile-friendly)
- ✅ Up to 500 results per query

## ⚠️ Notes

- This project was developed for the **Santiago de Cali Mayor's Office** and depends on the availability of its API and Daruma portal
- API tokens and credentials are not included in this repository
- Scraping respects Apps Script limits (6 min execution) using chained triggers

## 📄 License

MIT — See [LICENSE](LICENSE)

## 🔗 Links

- **Public query (Daruma Portal)**: https://sig.cali.gov.co/app.php/staff/portal/tab/16
- **Repository**: https://github.com/pertiga-gio/manualito-en-daruma
- **Architecture docs**: [docs/arquitectura.md](docs/arquitectura.md) (Spanish)

## 👤 Author

Developed by **Giovanni Sánchez Soto** — April 2026

For the Subdirectorate of Strategic Human Talent Management, Administrative Department of Institutional Development and Innovation, Santiago de Cali Mayor's Office.
