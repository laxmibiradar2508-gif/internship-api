# Internship Board API

A REST API built with Node.js, Express, and SQLite for managing internship
records and student applications. Includes input validation, pagination,
filtering, and a consistent response envelope.

## Tech Stack
- Node.js + Express
- SQLite (built-in `node:sqlite` module)
- express-validator for input validation

## Setup

```bash
git clone <your-repo-url>
cd internship-api
npm install
npm start
```

Server runs on `http://localhost:3000`. It auto-creates `data.sqlite` and
seeds 5 sample internships on first run.

## Response Format

Success:
```json
{ "status": "success", "data": { ... }, "pagination": { "page": 1, "limit": 10, "total": 5, "totalPages": 1 } }
```

Error:
```json
{ "status": "error", "message": "Validation failed", "errors": [ { "field": "applicant_email", "message": "a valid applicant_email is required" } ] }
```

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /api/internships | List internships (pagination + filters) |
| GET | /api/internships/:id | Get one internship |
| POST | /api/internships | Create an internship |
| PATCH | /api/internships/:id | Update an internship |
| DELETE | /api/internships/:id | Delete an internship |
| POST | /api/internships/:id/applications | Apply to an internship |
| GET | /api/internships/:id/applications | List applications |

## Example (curl)

```bash
curl "http://localhost:3000/api/internships?page=1&limit=3&mode=Remote"
curl -X POST http://localhost:3000/api/internships/INT-101/applications -H "Content-Type: application/json" -d "{\"applicant_name\":\"Asha Rao\",\"applicant_email\":\"asha@example.com\"}"
```
