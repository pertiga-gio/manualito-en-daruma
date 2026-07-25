# 📋 Manualito en Daruma

**Web app for searching job description manuals — Santiago de Cali Mayor's Office**

🔗 **Portal de Daruma (public)**: https://sig.cali.gov.co/app.php/staff/portal/tab/16

![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Google%20Apps%20Script-orange)
![Status](https://img.shields.io/badge/status-production-success)
![Language](https://img.shields.io/badge/language-JavaScript-yellow)
![Web Scraping](https://img.shields.io/badge/tech-web%20scraping-red)

---

## 🇬🇧 English Summary

**Manualito en Daruma** is a web application that simplifies searching for job description manuals (fichas de funciones) within the Daruma portal of the Santiago de Cali Mayor's Office (Alcaldía de Cali), Colombia.

### Problem
The Daruma portal — the city's HR document system — had no advanced search. Finding a specific job manual required opening each file one by one. Key fields like "current decree" and "job level" weren't available as structured data, only embedded in HTML.

### Solution
A Google Apps Script web app that:
- **Inventories all job manuals** via the SIG Cali API
- **Extracts unstructured fields** (decree, level, area, purpose) via HTML web scraping with regex parsing
- **Provides a searchable web interface** with combined filters (level, code, grade, department/area) and free-text search
- **Auto-updates daily at 4:00 AM** using incremental processing — only scrapes new or modified records

### Tech stack
- **Google Apps Script** (backend + web app hosting)
- **Google Sheets** (data storage)
- **Vanilla HTML/CSS/JavaScript** (frontend)
- **Web scraping** (HTML parsing with regex for fields not exposed by the API)
- **Time-based triggers** (chained execution to bypass Apps Script's 6-minute limit)

### Stats
- **28 fields per manual** extracted (some from API, some from HTML scraping)
- **Concurrent batch processing** (5 parallel requests, batches of 40)
- **Incremental updates** (only changed records are re-scraped)
- **500 results per page** with real-time filtering

Deployed in **April 2026** for the Santiago de Cali Mayor's Office. Developed by **Giovanni Sánchez Soto**.
