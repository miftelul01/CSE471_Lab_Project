# BRAC UNIVERSITY

# Inspiring Excellence

**Course:** CSE471: System Analysis and Design\
**Assignment:** Assignment on Functional Requirements\
**Proposed Project Title:** Smart Mess & Property Management System\
**Group No:** \[TBD] | **CSE471 Lab Section:** \[TBD] | **Semester:** \[Semester] \[Year]

## Team Members

| **SL** | **ID** | **Name** |
| --- | --- | --- |
| 1 | 23101222 | Miftelul Mehebub |
| 2 | 23101410 | Mahia Tanzin |
| 3 | 22301105 | Md. Mahidul Alam Araf |

**Submission Date:** \[TBD]

## Project Overview

The "Smart Mess & Property Management System" is a comprehensive web platform designed to streamline house/mess management, bridge the gap between landlords and tenants, and automate daily household operations. The system eliminates manual financial tracking, simplifies roommate matching, and provides powerful integrations for schedule and chore synchronization. It ensures a transparent, democratic, and accountable living environment for shared spaces.

## Tech Stack

- **Language:** Typescript, Javascript
- **Framework:** Next.js
- **Styling:** TailwindCSS
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Deployment:** Vercel
- **External APIs:** Google Maps API, Google Tasks API, Google Calendar API, bKash/Stripe API

## User Roles

- **Landlord / House Admin:** Property owners or assigned house managers. They can list properties, manage maintenance tickets, and monitor guest logs.
- **Resident:** The primary users living in the mess. They can log expenses, vote on meals, track chores, pay bills, and raise disputes.
- **Admin:** A system super-user responsible for platform monitoring and overarching settings.

## Functional Requirements

### Common Workflows

| **SL** | **Common Workflows** |
| --- | --- |
| 1 | **Registration, Login & SSO:** Users can create an account via standard email/password or Single Sign-On (Google). Includes comprehensive user profile management where users can update contact info, emergency details, and house assignments. |
| 2 | **Role & Admin Activities:** Automated role switching based on house join requests. Admins oversee system-wide parameters, resolve escalated disputes, and manage overarching platform settings. |

### Module 1

| **Member** | **Feature Description** |
| --- | --- |
| Miftelul Mehebub | **Property & Room Listing Engine:** Landlords or house admins can post available rooms or houses with detailed information including rent, location, room type, and amenities. Prospective residents can search and filter these listings based on budget, area, and preferences. The system supports full CRUD operations, allowing admins to edit or delist properties. |
| Mahia Tanzin | **Smart Roommate & House Matching:** Users configure a personal profile with lifestyle preferences (budget, sleep schedule, cleanliness). The system suggests compatible property listings and roommates based on overlap. Users can save favorites and send formal join requests to a house, ensuring better living compatibility. |
| Md. Mahidul Alam Araf | **Guest Registration & Accountability Log:** A tracking feature where residents must log guest check-ins and check-outs, specifying name, duration, and purpose. The system automatically notifies the landlord or house admin of new guests, maintaining a permanent, secure log per house for safety and accountability. |

### Module 2

| **Member** | **Feature Description** |
| --- | --- |
| Miftelul Mehebub | **Shared Wallet & Bill-Splitting Engine:** A financial dashboard where any resident can add shared expenses like rent, utilities, or groceries. The system automatically splits the cost across roommates equally or by a custom ratio. It maintains a running ledger per house, tracking exactly who has paid and who is pending. |
| Mahia Tanzin | **Weekly Menu Proposal & Voting System:** A democratic tool for mess management where residents can propose meal plans for the upcoming week. Other residents cast their votes on the proposals, and the highest-voted plan automatically becomes the official mess menu, reducing daily arguments over food. |
| Md. Mahidul Alam Araf | **Meal Attendance & Auto-Quantity Adjustment:** A daily tracker where residents toggle their attendance for upcoming meals (attend/skip). The system recalculates required grocery quantities for the cook and automatically adjusts the skipped meal costs, deducting them from the absent resident's share in the shared wallet. |

### Module 3

| **Member** | **Feature Description** |
| --- | --- |
| Miftelul Mehebub | **Maintenance Ticket System:** Residents can report property issues (e.g., leaking tap, broken AC) complete with a description and status. The landlord receives the ticket and updates the status (open -> in progress -> resolved). A full history log is maintained per house. |
| Miftelul Mehebub | **Payment Integration (bKash/Stripe API):** Integrated directly with the Shared Wallet, allowing residents to pay their calculated share of the bills securely through the app. Upon successful payment, the user's ledger status automatically updates to "paid". |
| Mahia Tanzin | **Google Maps API Integration:** Enhances the property discovery phase by displaying real-world locations of listings on an embedded Google Map. This visual tool helps prospective tenants calculate commute distances and evaluate the surrounding area. |
| Mahia Tanzin | **Automated Chore Rotation (Google Tasks API):** Automatically assigns and rotates weekly household chores (cleaning, grocery runs) among residents. Each assignment is pushed directly to the assigned resident's personal Google Tasks with due dates and notifications. |
| Md. Mahidul Alam Araf | **Mess Court (Conflict-Resolution State Machine):** A formalized engine for resolving household conflicts (e.g., unpaid bills, noise). Rather than a basic CRUD table, this system utilizes a strict state machine architecture (Raised → Voting → Resolved → Escalated → Archived). It includes automated background jobs for timeouts (e.g., auto-escalating a dispute to the landlord if voting fails to reach consensus within 48 hours) and enforces strict state transitions, providing a robust and technically defensible governance system. |
| Md. Mahidul Alam Araf | **Google Calendar API Integration:** A synchronization feature that pushes all critical house events—such as rent due dates, guest check-in windows, and dispute resolution deadlines—to a shared house Google Calendar. |
