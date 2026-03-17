# Swiss Federal Tax Calculator — API Reference

Reverse-engineered from [swisstaxcalculator.estv.admin.ch](https://swisstaxcalculator.estv.admin.ch/#/calculator/income-wealth-tax).

The Swiss Federal Tax Administration (ESTV) tax calculator is a React SPA backed by unauthenticated REST APIs. All endpoints accept and return JSON, require no cookies, tokens, or sessions, and can be called directly via `curl` or any HTTP client.

**Version observed:** Frontend 1.0.44, static assets ost-web/1.4.52.

---

## Table of Contents

- [Base URL](#base-url)
- [Endpoints Overview](#endpoints-overview)
- [API_searchLocation — Find a Municipality](#api_searchlocation--find-a-municipality)
- [API_calculateDetailedTaxes — Basic Calculation](#api_calculatedetailedtaxes--basic-calculation)
- [API_calculateTaxBudget — Get Deduction Line Items](#api_calculatetaxbudget--get-deduction-line-items)
- [API_calculateDetailedTaxes — Detailed Calculation (with Budget)](#api_calculatedetailedtaxes--detailed-calculation-with-budget)
- [Field Enumerations](#field-enumerations)
- [Budget Items Reference](#budget-items-reference)
- [Info Tooltips — Field Descriptions from the UI](#info-tooltips--field-descriptions-from-the-ui)
- [Auxiliary Endpoints](#auxiliary-endpoints)
- [Workflow: How to Automate a Tax Calculation](#workflow-how-to-automate-a-tax-calculation)
- [Examples](#examples)

---

## Base URL

All tax calculation endpoints share this base:

```
https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV/
```

All requests are `POST` with `Content-Type: application/json`.

---

## Endpoints Overview

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `API_searchLocation` | POST | Search for a municipality by name or postcode |
| `API_calculateDetailedTaxes` | POST | Calculate income & wealth tax (basic or detailed) |
| `API_calculateTaxBudget` | POST | Get available deduction/budget line items for detailed mode |
| `API_getTaxVersion` | POST | Get current tax calculator version info |
| `API_getTaxYearRange` | POST | Get available tax years per calculator type |
| `API_getTaxYearRangeCanton` | POST | Get canton-specific year ranges |

---

## API_searchLocation — Find a Municipality

Returns a list of municipalities matching a search string. You need the `TaxLocationID` from the results to use in calculations.

### Request

```json
{
  "Search": "Zürich",
  "Language": 4,
  "TaxYear": 2025
}
```

| Field | Type | Description |
|-------|------|-------------|
| `Search` | string | Search text — city name, postcode, or partial match |
| `Language` | integer | `1` = DE, `2` = FR, `3` = IT, `4` = EN |
| `TaxYear` | integer | Tax year (affects which municipalities are available) |

### Response

```json
{
  "response": [
    {
      "TaxLocationID": 300000000,
      "ZipCode": "3000",
      "BfsID": 351,
      "CantonID": 4,
      "BfsName": "",
      "City": "Bern",
      "Canton": "BE"
    },
    {
      "TaxLocationID": 800100000,
      "ZipCode": "8001",
      "BfsID": 261,
      "CantonID": 26,
      "BfsName": "",
      "City": "Zürich",
      "Canton": "ZH"
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `TaxLocationID` | Unique location identifier — use this in calculation requests |
| `ZipCode` | Swiss postcode |
| `BfsID` | Federal Statistical Office municipality number |
| `CantonID` | Canton identifier (see [Canton IDs](#canton-ids)) |
| `City` | City/town name in the requested language |
| `Canton` | Two-letter canton abbreviation |

### Example

```bash
curl -s -X POST 'https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV/API_searchLocation' \
  -H 'Content-Type: application/json' \
  -d '{"Search":"Bern","Language":4,"TaxYear":2025}'
```

---

## API_calculateDetailedTaxes — Basic Calculation

The main calculation endpoint. When `Budget` is an empty array `[]`, it performs a standard (non-detailed) calculation using built-in defaults for deductions.

### Request

```json
{
  "SimKey": null,
  "TaxYear": 2025,
  "TaxLocationID": 800100000,
  "Relationship": 1,
  "Confession1": 5,
  "Children": [],
  "Age1": 35,
  "RevenueType1": 1,
  "Revenue1": 100000,
  "Fortune": 50000,
  "Confession2": 0,
  "Age2": 0,
  "RevenueType2": 0,
  "Revenue2": 0,
  "Budget": []
}
```

| Field | Type | Description |
|-------|------|-------------|
| `SimKey` | null or string | Simulation key (use `null` for standalone calculations) |
| `TaxYear` | integer | Tax year (e.g., `2025`) |
| `TaxLocationID` | integer | Municipality ID from `API_searchLocation` |
| `Relationship` | integer | Marital status (see [Relationship](#relationship)) |
| `Confession1` | integer | Religion of taxpayer 1 (see [Confession](#confession)) |
| `Children` | array | Array of child ages, e.g. `[5, 12]` for two children. Empty `[]` = no children |
| `Age1` | integer | Age of taxpayer 1 |
| `RevenueType1` | integer | Income type of taxpayer 1 (see [RevenueType](#revenuetype)) |
| `Revenue1` | integer | Income amount in CHF for taxpayer 1 |
| `Fortune` | integer | Net worth in CHF |
| `Confession2` | integer | Religion of taxpayer 2 (`0` if no partner) |
| `Age2` | integer | Age of taxpayer 2 (`0` if no partner) |
| `RevenueType2` | integer | Income type of taxpayer 2 (`0` if no partner) |
| `Revenue2` | integer | Income of taxpayer 2 (`0` if no partner) |
| `Budget` | array | Deduction line items (empty `[]` for basic mode — see [Detailed Calculation](#api_calculatedetailedtaxes--detailed-calculation-with-budget) for detailed mode) |

### Response

```json
{
  "response": {
    "TotalTax": 12074,
    "TotalNetTax": 12074,
    "IncomeTaxCanton": 4672,
    "IncomeTaxCity": 5673,
    "IncomeTaxFed": 1705,
    "IncomeTaxChurch": 0,
    "PersonalTax": 24,
    "TaxCredit": 0,
    "FortuneTaxCanton": 0,
    "FortuneTaxCity": 0,
    "FortuneTaxChurch": 0,
    "TaxableIncomeCanton": 84073,
    "TaxableIncomeFed": 85173,
    "AssertiveIncomeCanton": 84073,
    "AssertiveIncomeFed": 85173,
    "TaxableFortuneCanton": 50000,
    "AssertiveFortuneCanton": 50000,
    "MarginalTaxRate": 26.1,
    "MarginalTaxRateVM": 0,
    "TaxFreedomDay": 45,
    "Diagnosis": "",
    "IncomeSimpleTaxCanton": 4767,
    "IncomeSimpleTaxCity": 4767,
    "IncomeSimpleTaxFed": 1705,
    "FortuneSimpleTaxCanton": 0,
    "FortuneSimpleTaxCity": 0,
    "IncomeP1": {
      "GrossIncome": 100000,
      "AIOContribution": 5300,
      "ALVContribution": 1100,
      "NBUContribution": 400,
      "BVGContribution": 3538,
      "NetIncome": 89662
    },
    "IncomeP2": {
      "GrossIncome": 0,
      "AIOContribution": 0,
      "ALVContribution": 0,
      "NBUContribution": 0,
      "BVGContribution": 0,
      "NetIncome": 0
    },
    "TaxRates": {
      "IncomeRateCanton": 98,
      "IncomeRateCity": 119,
      "IncomeRateRoman": 10,
      "IncomeRateProtestant": 10,
      "IncomeRateChrist": 14,
      "FortuneRateCanton": 98,
      "FortuneRateCity": 119,
      "FortuneRateRoman": 10,
      "FortuneRateProtestant": 10,
      "FortuneRateChrist": 14,
      "ProfitTaxRateCanton": 0,
      "ProfitTaxRateCity": 0,
      "ProfitTaxRateChurch": 0,
      "CapitalTaxRateCanton": 0,
      "CapitalTaxRateCity": 0,
      "CapitalTaxRateChurch": 0
    },
    "Location": {
      "TaxLocationID": 800100000,
      "ZipCode": "8001",
      "BfsID": 261,
      "CantonID": 26,
      "BfsName": "Zürich",
      "City": "Zürich",
      "Canton": "ZH"
    },
    "InfoBoth": [ ... ],
    "InfoCanton": [ ... ],
    "InfoFed": [ ... ]
  }
}
```

### Response Field Reference

#### Top-level tax amounts

| Field | Description |
|-------|-------------|
| `TotalTax` | Total tax burden in CHF |
| `TotalNetTax` | Total net tax after credits |
| `IncomeTaxCanton` | Cantonal income tax |
| `IncomeTaxCity` | Communal (municipal) income tax |
| `IncomeTaxFed` | Direct federal income tax |
| `IncomeTaxChurch` | Church tax (0 if Other/None) |
| `PersonalTax` | Personal tax (fixed per-person levy) |
| `TaxCredit` | Tax credit amount |
| `FortuneTaxCanton` | Cantonal wealth tax |
| `FortuneTaxCity` | Communal wealth tax |
| `FortuneTaxChurch` | Church wealth tax |

#### Taxable amounts

| Field | Description |
|-------|-------------|
| `TaxableIncomeCanton` | Taxable income for cantonal/communal tax |
| `TaxableIncomeFed` | Taxable income for federal tax |
| `AssertiveIncomeCanton` | Assertive (determining) income for canton |
| `AssertiveIncomeFed` | Assertive income for federation |
| `TaxableFortuneCanton` | Taxable wealth for canton |
| `AssertiveFortuneCanton` | Assertive wealth for canton |

#### Rates and indicators

| Field | Description |
|-------|-------------|
| `MarginalTaxRate` | Marginal tax rate on income (%) |
| `MarginalTaxRateVM` | Marginal tax rate on wealth (%) |
| `TaxFreedomDay` | Day of year from which you "stop working for taxes" |
| `Diagnosis` | Error/warning message (empty if OK) |

#### Simple tax amounts (before multipliers)

| Field | Description |
|-------|-------------|
| `IncomeSimpleTaxCanton` | Base cantonal income tax (before multiplier) |
| `IncomeSimpleTaxCity` | Base communal income tax (before multiplier) |
| `IncomeSimpleTaxFed` | Federal income tax (no multiplier applies) |
| `FortuneSimpleTaxCanton` | Base cantonal wealth tax |
| `FortuneSimpleTaxCity` | Base communal wealth tax |

#### Income breakdown (per person)

| Field | Description |
|-------|-------------|
| `IncomeP1` / `IncomeP2` | Income breakdown for each taxpayer |
| `.GrossIncome` | Gross income |
| `.AIOContribution` | OASI/DI/APG (AHV/IV/EO) contributions |
| `.ALVContribution` | Unemployment insurance (ALV) contributions |
| `.NBUContribution` | Non-occupational accident insurance (NBU) |
| `.BVGContribution` | Pension fund (BVG/2nd pillar) contributions |
| `.NetIncome` | Net income after social insurance deductions |

#### Tax multipliers

The `TaxRates` object contains the multipliers applied by the municipality:

| Field | Description |
|-------|-------------|
| `IncomeRateCanton` | Canton's income tax multiplier (%) |
| `IncomeRateCity` | Municipality's income tax multiplier (%) |
| `IncomeRateRoman` | Roman Catholic church income tax multiplier (%) |
| `IncomeRateProtestant` | Protestant church income tax multiplier (%) |
| `IncomeRateChrist` | Christian Catholic church income tax multiplier (%) |
| `FortuneRate*` | Same structure for wealth tax |

#### Info arrays

The response includes three info arrays that provide the detailed breakdown of income/deductions/wealth calculations:

- `InfoBoth` — Combined canton + federation view (what the "Details" section shows)
- `InfoCanton` — Canton-specific breakdown
- `InfoFed` — Federal-specific breakdown

Each entry has this structure:

```json
{
  "Group": {
    "ID": "TXT_201",
    "DE": "Einkommen aus Erwerbstätigkeit",
    "EN": "Earned income",
    "FR": "Revenus d'une activité professionnelle",
    "IT": "Redditi da attività lucrativa"
  },
  "Entry": {
    "ID": "TXT_1",
    "DE": "Unselbständiger Erwerb Nettolohn",
    "EN": "Disposable income from gainful employment",
    "FR": "Revenu net salarié",
    "IT": "Salario netto da attività lucrativa dipendente"
  },
  "Canton": 89662,
  "Fed": 89662,
  "Value": 0,
  "Main": 1
}
```

---

## API_calculateTaxBudget — Get Deduction Line Items

Returns the list of available budget/deduction items for the given taxpayer profile. This is the equivalent of toggling the "Detailed calculation: add deductions" switch in the UI. The response contains pre-calculated default values.

### Request

Same shape as `API_calculateDetailedTaxes`:

```json
{
  "SimKey": null,
  "TaxYear": 2025,
  "TaxLocationID": 800100000,
  "Relationship": 1,
  "Confession1": 5,
  "Children": [],
  "Age1": 35,
  "RevenueType1": 1,
  "Revenue1": 100000,
  "Fortune": 50000,
  "Confession2": 0,
  "Age2": 0,
  "RevenueType2": 0,
  "Revenue2": 0,
  "Budget": []
}
```

### Response

Returns an array of budget items:

```json
{
  "response": [
    {
      "Ident": "BRUTTOLOHN_P1",
      "Value": 100000,
      "Show": false,
      "Main": 1,
      "Name": {
        "ID": "TXT_BRUTTOLOHN_P1",
        "DE": "Bruttolohn",
        "EN": "",
        "FR": "Revenu brut",
        "IT": ""
      }
    },
    ...
  ]
}
```

| Field | Description |
|-------|-------------|
| `Ident` | Unique identifier for the budget item — used when sending back to calculate |
| `Value` | Default/calculated value in CHF |
| `Show` | `true` = editable by user in the UI, `false` = computed/hidden |
| `Main` | Category: `1` = Income, `2` = Deductions/Expenditure, `3` = Wealth |
| `Name` | Multilingual label with `.ID`, `.DE`, `.EN`, `.FR`, `.IT` |

### Important: Available items depend on `RevenueType`

The list of returned items varies based on the income type:

- **Gross income (`RevenueType1: 1`)**: Includes pillar 3a, meal costs, commuting costs, professional expenses
- **Net income (`RevenueType1: 2`)**: Includes pillar 3a, meal costs, commuting costs, professional expenses
- **Taxable income (`RevenueType1: 3`)**: Minimal deductions (income is already "taxable")
- **Pension income (`RevenueType1: 4`)**: Pension-specific deductions
- **Other income (`RevenueType1: 5`)**: No employment-specific deductions

---

## API_calculateDetailedTaxes — Detailed Calculation (with Budget)

To perform a detailed calculation with custom deductions, pass the budget items in the `Budget` array. You must include **all** items returned by `API_calculateTaxBudget` (both `Show: true` and `Show: false`), with any values you want to override.

### Request with Budget

```json
{
  "SimKey": null,
  "TaxYear": 2025,
  "TaxLocationID": 800100000,
  "Relationship": 1,
  "Confession1": 5,
  "Children": [],
  "Age1": 35,
  "RevenueType1": 1,
  "Revenue1": 100000,
  "Fortune": 50000,
  "Confession2": 0,
  "Age2": 0,
  "RevenueType2": 0,
  "Revenue2": 0,
  "Budget": [
    {"Ident": "BRUTTOLOHN_P1", "Value": 100000},
    {"Ident": "BEITRAG_AIO_P1", "Value": 5300},
    {"Ident": "BEITRAG_ALV_P1", "Value": 1100},
    {"Ident": "BEITRAG_NBU_P1", "Value": 400},
    {"Ident": "BEITRAG_BVG_P1", "Value": 3538},
    {"Ident": "NETTOLOHN_P1", "Value": 89662},
    {"Ident": "NEBENERWERB_P1", "Value": 0},
    {"Ident": "MIETERTRAG", "Value": 0},
    {"Ident": "UEBRIGESEK", "Value": 0},
    {"Ident": "VMERTRAEGE", "Value": 0},
    {"Ident": "BETEILIGUNG", "Value": 0},
    {"Ident": "KKPRAEMIEN", "Value": 4560},
    {"Ident": "IPVEXTRA", "Value": 0},
    {"Ident": "PRAEMIEN3A", "Value": 7056},
    {"Ident": "VERPFLEGUNG_P1", "Value": 0},
    {"Ident": "FAHRKOSTEN_P1", "Value": 3000},
    {"Ident": "BERUFSKOSTEN_P1", "Value": 0},
    {"Ident": "BERUFSAUSLAGEN_NE_P1", "Value": 0},
    {"Ident": "MIETAUSGABEN", "Value": 22420},
    {"Ident": "SCHULDZINSEN", "Value": 0},
    {"Ident": "IMMOUNTERHALT", "Value": 0},
    {"Ident": "UEBRIGEABZUEGE", "Value": 0},
    {"Ident": "NETTO_VM", "Value": 50000}
  ]
}
```

The response is identical in shape to the basic calculation.

---

## Field Enumerations

### Relationship

| Value | Meaning |
|-------|---------|
| `1` | Single |
| `2` | Married |
| `3` | Civil partnership (registered partnership) |
| `4` | Cohabiting (unmarried couple) |

When `Relationship` is `2` or `3` (has partner), fill `Confession2`, `Age2`, `RevenueType2`, and `Revenue2`.

### Confession

| Value | Meaning |
|-------|---------|
| `1` | Roman Catholic |
| `2` | Protestant (Reformed) |
| `3` | Christian Catholic (Old Catholic) |
| `5` | Other / None |

### RevenueType

These are the values sent in `RevenueType1` / `RevenueType2`. The UI labels map to internal API values as follows:

| UI Label | RevenueType value | Internal mapping (from JS source) |
|----------|-------------------|-----------------------------------|
| Gross income | `1` | `G.EMPLOYED` |
| Net income | `2` | `G.SELF_EMPLOYED` |
| Taxable income | `0` (special) | Returns `null` — no social insurance deductions applied |
| Pension income | `3` | `G.PENSIONER` |
| Other income | `4` | `G.UNEMPLOYED` |

Note: "Taxable income" is special — when selected, the API receives `RevenueType: 0` and treats the `Revenue` amount as already taxable (no social insurance deductions are applied).

### Children

The `Children` field is an array of child ages. Examples:

- No children: `[]`
- One child aged 5: `[5]`
- Two children aged 5 and 12: `[5, 12]`
- Three children: `[3, 8, 15]`

### Language

Used in `API_searchLocation`:

| Value | Language |
|-------|----------|
| `1` | German (DE) |
| `2` | French (FR) |
| `3` | Italian (IT) |
| `4` | English (EN) |

### Canton IDs

Selected canton IDs observed in responses:

| ID | Canton |
|----|--------|
| `4` | BE (Bern) |
| `8` | GE (Geneva) |
| `26` | ZH (Zürich) |

The full list follows the official Swiss canton numbering (BFS).

---

## Budget Items Reference

Complete list of budget items returned by `API_calculateTaxBudget` for a gross-income single taxpayer.

### Income items (Main = 1)

| Ident | German | French | Default behavior |
|-------|--------|--------|-----------------|
| `BRUTTOLOHN_P1` | Bruttolohn | Revenu brut | Hidden. Equals `Revenue1`. |
| `BEITRAG_AIO_P1` | AHV+IV+EO Beiträge | Cotisations AVS+AI+APG | Hidden. Auto-calculated (5.3% of gross). |
| `BEITRAG_ALV_P1` | ALV Beiträge | Cotisations AC | Hidden. Auto-calculated (1.1% of gross). |
| `BEITRAG_NBU_P1` | NBU Beiträge | Cotisations AANP | Hidden. Auto-calculated (~0.4% of gross). |
| `BEITRAG_BVG_P1` | BVG Beiträge | Cotisations LPP | Hidden. Auto-calculated based on age/income. |
| `NETTOLOHN_P1` | Nettolohn | Revenu net | Hidden. Gross minus social insurance. |
| `NEBENERWERB_P1` | Nettolohn Nebenerwerb | Revenu complémentaire net | Editable. Secondary employment net income. |
| `MIETERTRAG` | Eigenmietwert und Mieterträge | Valeur locative et revenus locatifs | Editable. Imputed rental value + rental income. |
| `UEBRIGESEK` | Übrige Einnahmen | Autres revenus | Editable. Other taxable income (e.g. alimony received). |
| `VMERTRAEGE` | Vermögenserträge | Revenus des titres | Editable. Investment income (interest, dividends). |
| `BETEILIGUNG` | davon aus Beteiligungen | part en participations | Editable. Subset of investment income from qualified participations (≥10% or ≥CHF 1M). Subject to partial taxation. |

### Deduction items (Main = 2)

| Ident | German | French | Default | Notes |
|-------|--------|--------|---------|-------|
| `KKPRAEMIEN` | Krankenkassenprämien | Primes d'assurance maladie | CHF 4,560/adult, 1,200/child | Source: Budgetberatung Schweiz |
| `IPVEXTRA` | Individuelle Prämienverbilligung | Réduction de prime individuelle | 0 | Enter if you receive premium reduction |
| `PRAEMIEN3A` | Beiträge an Säule 3a | Contributions pilier 3a | 0 | **Only for Gross/Net income types.** Total 3a contributions by both taxpayers. |
| `VERPFLEGUNG_P1` | Verpflegungskosten | Frais de restauration | 0 | **Only for Gross/Net income types.** Meal costs at workplace. |
| `FAHRKOSTEN_P1` | Fahrkosten | Frais de déplacement | 0 | **Only for Gross/Net income types.** Commuting costs. |
| `BERUFSKOSTEN_P1` | Übrige Berufsauslagen | Autres frais professionnels | 0 | **Only for Gross/Net income types.** Enter actual or system uses flat-rate. |
| `BERUFSAUSLAGEN_NE_P1` | Berufsauslagen Nebenerwerb | Frais prof. revenu compl. | 0 | Professional expenses for secondary occupation. |
| `MIETAUSGABEN` | Mietausgaben | Frais de location | ~25% of income | **Relevant for cantons VD and ZG only.** Enter 0 if no rent expenses. |
| `SCHULDZINSEN` | Schuldzinsen | Intérêts des dettes | 0 | Mortgage interest, etc. Max = investment income + CHF 50,000. |
| `IMMOUNTERHALT` | Unterhaltskosten Immobilien | Frais d'entretient d'immeubles | 0 | Building maintenance. Assumes building >10 years old (VD: >20). |
| `UEBRIGEABZUEGE` | Übrige Abzüge | Autres déductions | 0 | Alimony paid, healthcare costs, support deductions, etc. |

### Wealth items (Main = 3)

| Ident | German | French | Notes |
|-------|--------|--------|-------|
| `NETTO_VM` | Reinvermögen | Fortune nette | Equals the `Fortune` parameter. |

### For married/partnered taxpayers (Relationship 2 or 3)

Additional `_P2` variants appear:
- `BRUTTOLOHN_P2`, `BEITRAG_AIO_P2`, `BEITRAG_ALV_P2`, `BEITRAG_NBU_P2`, `BEITRAG_BVG_P2`, `NETTOLOHN_P2`
- `NEBENERWERB_P2`
- `VERPFLEGUNG_P2`, `FAHRKOSTEN_P2`, `BERUFSKOSTEN_P2`, `BERUFSAUSLAGEN_NE_P2`

---

## Info Tooltips — Field Descriptions from the UI

These are the explanatory texts from the (i) info icons in the calculator UI.

### Income fields

| Field | Tooltip |
|-------|---------|
| **Imputed rental value and rental income** | Revenue from use of housing owned and occupied by you (imputed rental value) and from rental income (excluding ancillary costs) |
| **Other income** | Other taxable income not yet entered (e.g. child support) |
| **Investment income** | e.g. savings interest, dividends, coupons (direct yield) |
| **of which from participations** | Participations are deemed to be significant if they represent at least 10% of the basic or nominal capital of another company or a market value of at least CHF 1 million. [See: Partial taxation of income from holdings](https://www.estv.admin.ch/dam/estv/de/dokumente/estv/steuersystem/steuermaeppchen/teilbesteuerung-ev-de-fr.pdf.download.pdf/teilbesteuerung-ev-de-fr.pdf) |

### Deduction fields

| Field | Tooltip |
|-------|---------|
| **Deductions** (section header) | [Overview for the whole of Switzerland](https://www.estv.admin.ch/estv/de/home/die-estv/steuersystem-schweiz/steuermaeppchen.html) on various receipts and deductions relating to income and wealth taxes of natural persons |
| **Insurance premiums and interest on savings capital** | Please enter your insurance premium costs and the interest on savings capital. If no individual values are entered, the following will be assumed: CHF 4,560 per adult (CHF 380/month, including children over 18), CHF 1,200 per child (CHF 100/month, only children under 18). Source: Budgetberatung Schweiz. [See: Deductions for insurance contributions](https://www.estv.admin.ch/dam/estv/de/dokumente/estv/steuersystem/steuermaeppchen/versicherungspraemien-zinsen-de-fr.pdf) |
| **Individual premium reduction** | If you receive a premium reduction, please enter the amount here. |
| **Contributions to pillar 3a** | Total of contributions to pillar 3a pension plan paid by you and taxpayer 2 |
| **Travel costs, main occupation** | Enter the actual travel costs between the place of residence and the place of work. [See: Deduction for travel costs](https://www.estv.admin.ch/dam/estv/de/dokumente/estv/steuersystem/steuermaeppchen/fahrkosten-de-fr.pdf) |
| **Other professional expenses** | Enter your actual professional expenses. Otherwise, the system will automatically calculate the flat-rate deduction. [See: Other professional expenses](https://www.estv.admin.ch/dam/estv/de/dokumente/estv/steuersystem/steuermaeppchen/berufskosten-de-fr.pdf) |
| **Professional expenses, secondary occupation** | Enter your actual professional expenses. Otherwise, the system will automatically calculate the flat-rate deduction. [See: Flat-rate deduction for secondary occupation](https://www.estv.admin.ch/dam/estv/de/dokumente/estv/steuersystem/steuermaeppchen/berufskosten-nebenerwerb-de-fr.pdf) |
| **Rental expenses** | Input relevant for cantons VD and ZG only. Assumption if no individual values entered: 25% of income. If you have no rental expenses, please enter 0. |
| **Debt interest** | Deductions can be made for payments due on debts, mortgages, building rights, etc., in the amount of the investment income plus a further CHF 50,000. |
| **Building maintenance costs** | Assumption: age of building > 10 years. (Canton VD > 20 years.) [See: Deduction for building maintenance costs](https://www.estv.admin.ch/dam/estv/de/dokumente/estv/steuersystem/steuermaeppchen/liegenschaftsunterhaltskosten-de-fr.pdf) |
| **Other deductions** | Deductions that cannot be calculated on the basis of known inputs (e.g. assistance payments, healthcare costs, deduction for support, maintenance contributions, etc.). [See: Overview](https://www.estv.admin.ch/estv/de/home/die-estv/steuersystem-schweiz/steuermaeppchen.html) |

---

## Auxiliary Endpoints

### API_getTaxVersion

Returns current version info.

```bash
curl -s -X POST 'https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV/API_getTaxVersion' \
  -H 'Content-Type: application/json' -d '{}'
```

### API_getTaxYearRange

Returns available tax years for a given calculator type.

```json
{"Calculator": 1}
```

Calculator values: `1` = Income/wealth, `2` = Lump-sum pension, `3` = Inheritance/gift, `4` = Profit/capital.

### Other auxiliary endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/delegate/ost-integration/v1/me` | GET | Current session info |
| `/delegate/ost-integration/v1/application-info` | GET | Application version info |
| `/delegate/ost-integration/v1/eportal-proxy/announcement` | GET | Service announcements |

---

## Workflow: How to Automate a Tax Calculation

### Basic calculation (no custom deductions)

1. **Find your municipality** via `API_searchLocation`
2. **Call `API_calculateDetailedTaxes`** with `Budget: []`
3. **Read the response** — `TotalTax`, tax breakdown, etc.

### Detailed calculation (with custom deductions)

1. **Find your municipality** via `API_searchLocation`
2. **Get default budget items** via `API_calculateTaxBudget` (same params)
3. **Modify the values** you want to customize (e.g., set `PRAEMIEN3A` to your actual 3a contribution)
4. **Call `API_calculateDetailedTaxes`** with the full `Budget` array (all items, both `Show: true` and `Show: false`)
5. **Read the response**

### Comparing scenarios

Simply call `API_calculateDetailedTaxes` multiple times with different parameters (different locations, income levels, deductions, etc.) and compare the `TotalTax` values.

---

## Examples

### Example 1: Basic calculation for Zürich

```bash
# Step 1: Find Zürich
curl -s -X POST 'https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV/API_searchLocation' \
  -H 'Content-Type: application/json' \
  -d '{"Search":"8001 Zürich","Language":4,"TaxYear":2025}'

# Step 2: Calculate (TaxLocationID 800100000 from step 1)
curl -s -X POST 'https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV/API_calculateDetailedTaxes' \
  -H 'Content-Type: application/json' \
  -d '{
    "SimKey": null,
    "TaxYear": 2025,
    "TaxLocationID": 800100000,
    "Relationship": 1,
    "Confession1": 5,
    "Children": [],
    "Age1": 35,
    "RevenueType1": 1,
    "Revenue1": 100000,
    "Fortune": 50000,
    "Confession2": 0,
    "Age2": 0,
    "RevenueType2": 0,
    "Revenue2": 0,
    "Budget": []
  }'

# Result: TotalTax = 12,074 CHF
```

### Example 2: Impact of pillar 3a contribution

```bash
# Get budget items first
curl -s -X POST '.../API_calculateTaxBudget' \
  -H 'Content-Type: application/json' \
  -d '{ ...same params as above... }'

# Then calculate with PRAEMIEN3A = 7056
curl -s -X POST '.../API_calculateDetailedTaxes' \
  -H 'Content-Type: application/json' \
  -d '{
    ...same params...,
    "Budget": [
      {"Ident":"BRUTTOLOHN_P1","Value":100000},
      {"Ident":"BEITRAG_AIO_P1","Value":5300},
      {"Ident":"BEITRAG_ALV_P1","Value":1100},
      {"Ident":"BEITRAG_NBU_P1","Value":400},
      {"Ident":"BEITRAG_BVG_P1","Value":3538},
      {"Ident":"NETTOLOHN_P1","Value":89662},
      {"Ident":"NEBENERWERB_P1","Value":0},
      {"Ident":"MIETERTRAG","Value":0},
      {"Ident":"UEBRIGESEK","Value":0},
      {"Ident":"VMERTRAEGE","Value":0},
      {"Ident":"BETEILIGUNG","Value":0},
      {"Ident":"KKPRAEMIEN","Value":4560},
      {"Ident":"IPVEXTRA","Value":0},
      {"Ident":"PRAEMIEN3A","Value":7056},
      {"Ident":"VERPFLEGUNG_P1","Value":0},
      {"Ident":"FAHRKOSTEN_P1","Value":0},
      {"Ident":"BERUFSKOSTEN_P1","Value":0},
      {"Ident":"BERUFSAUSLAGEN_NE_P1","Value":0},
      {"Ident":"MIETAUSGABEN","Value":22420},
      {"Ident":"SCHULDZINSEN","Value":0},
      {"Ident":"IMMOUNTERHALT","Value":0},
      {"Ident":"UEBRIGEABZUEGE","Value":0},
      {"Ident":"NETTO_VM","Value":50000}
    ]
  }'

# Result: TotalTax = 10,269 CHF (saving 1,805 CHF vs. no 3a)
```

### Example 3: Married couple, two children, Bern

```bash
curl -s -X POST '.../API_calculateDetailedTaxes' \
  -H 'Content-Type: application/json' \
  -d '{
    "SimKey": null,
    "TaxYear": 2025,
    "TaxLocationID": 300000000,
    "Relationship": 2,
    "Confession1": 2,
    "Children": [8, 12],
    "Age1": 42,
    "RevenueType1": 1,
    "Revenue1": 120000,
    "Fortune": 200000,
    "Confession2": 2,
    "Age2": 40,
    "RevenueType2": 1,
    "Revenue2": 80000,
    "Budget": []
  }'
```

---

## Notes

- **No authentication required.** All endpoints are publicly accessible.
- **No rate limiting observed** during testing, but be reasonable with request volume.
- **The `c3b67379_ESTV` path segment** appears to be a stable application identifier, not a session token.
- **English translations** are sometimes missing in budget item `Name.EN` fields — fall back to `Name.DE`.
- **Rental expenses (`MIETAUSGABEN`)** default to ~25% of income but are only meaningful for cantons VD and ZG. For other cantons, the value is ignored in the calculation but still returned.
- **The API uses XHR** (XMLHttpRequest), not `fetch`, in the browser frontend.
