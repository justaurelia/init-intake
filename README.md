# 🧠 Conversational Project Intake --- Prototype

🔗 **Live demo:**\
https://init-intake.vercel.app/

------------------------------------------------------------------------

## Overview

This prototype demonstrates how a conversational interface can capture
project requirements, qualify complexity, and guide users toward the
appropriate level of support --- without forms or lengthy
back-and-forth.

Users can describe their needs in plain language. The system extracts
key signals (quantity, budget, logistics, timeline, etc.) and determines
how the request should be handled.

------------------------------------------------------------------------

## What this prototype demonstrates

-   Natural-language project intake\
-   Real-time extraction of key requirements\
-   Automatic qualification of request complexity\
-   Routing to the appropriate service level\
-   Clear next steps for the requester\
-   Reduced burden on sales teams

------------------------------------------------------------------------

## Service paths

### 🟢 Streamlined

Straightforward requests that can move quickly using predefined options.

**Typical characteristics**

-   Clear quantity and budget\
-   Single delivery location (bulk shipping)\
-   Minimal customization\
-   Flexible timeline

➡️ The system can suggest ready-to-execute options.

------------------------------------------------------------------------

### 🟡 Assisted

Projects that benefit from guidance and coordination.

**Typical characteristics**

-   Delivery to multiple addresses\
-   Some branding or customization\
-   Need for curated recommendations\
-   Moderate operational complexity

➡️ Routed for sales coordination while continuing to collect useful
information.

------------------------------------------------------------------------

### 🔴 Consultation required

Complex or highly customized programs requiring dedicated planning.

**Typical characteristics**

-   Large quantities\
-   Advanced customization (e.g., embroidery)\
-   International distribution\
-   Tight deadlines\
-   Multi-step logistics

➡️ Requires a scoping discussion before execution.

------------------------------------------------------------------------

## Try it yourself

You can type anything in natural language, or copy-paste one of the
examples below.

------------------------------------------------------------------------

### 🟢 Example --- Streamlined request

    We need 40 gifts, budget is $45 each, bulk delivery to our SF office, no branding, delivery in 4 weeks.

**Expected behavior**

-   Classified as Streamlined\
-   Suggested options may appear\
-   Minimal follow-up questions

------------------------------------------------------------------------

### 🟡 Example --- Assisted request

    120 gifts, $85 each, ship to employees’ home addresses across the US, include a note card, mid-December delivery.

**Expected behavior**

-   Classified as Assisted\
-   Additional coordination required\
-   May request contact information

------------------------------------------------------------------------

### 🔴 Example --- Consultation required

    250 embroidered hoodies, ship to individual addresses in the US and Canada, you handle collection and distribution, needed in 2 weeks.

**Expected behavior**

-   Classified as Consultation required\
-   High complexity\
-   Indicates need for dedicated planning

------------------------------------------------------------------------

### ❓ Example --- Incomplete request

    We’d like to explore a small gifting project.

The system will ask targeted follow-up questions to clarify
requirements.

------------------------------------------------------------------------

### 🤷 Example --- Uncertain answers

You can respond with:

    Not sure

or

    I don’t know

The intake will continue without blocking progress.

------------------------------------------------------------------------

## How the system works (high level)

Instead of a rigid form, the system incrementally extracts signals from
each message:

-   approximate quantity\
-   per-unit budget\
-   delivery model (bulk vs individual)\
-   branding requirements\
-   geographic scope\
-   timeline\
-   contact details

Each message updates the project brief in real time.\
Once sufficient information is gathered, the system determines the
appropriate service path and suggests next steps.

------------------------------------------------------------------------

## Why this approach matters

Traditional intake processes often create friction:

-   Customers don't know what information is required\
-   Sales teams spend time qualifying basic details\
-   Complex requests arrive without context\
-   Small requests consume disproportionate effort

Conversational intake can:

✔ Reduce back-and-forth\
✔ Improve lead quality\
✔ Accelerate response times\
✔ Scale operations without adding headcount

------------------------------------------------------------------------

## Prototype scope

This is a proof-of-concept focused on intake and qualification only.

It does **not**:

-   process payments\
-   finalize orders\
-   generate binding quotes\
-   replace human review

All requests would still be validated before execution.

------------------------------------------------------------------------

## Feedback

Observations about clarity, usefulness, or missing information are
welcome.
