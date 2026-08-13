# **Smart Mess & Property Management System — Feature Redesign**

**Stack:** Next.js · TypeScript · Tailwind · PostgreSQL · Prisma · Vercel · Google Maps/Tasks/Calendar API · bKash/Stripe

This document reworks each team member's assigned features into technically deeper versions, adds new features per person, and closes with cross-cutting architecture and demo-strategy recommendations.

---

## **Miftelul Mehebub**

### **1\. Property & Room Listing**

**Current Idea**

* Landlords post rooms.  
* Students search using filters like price and location.

  ### **Improved Idea**

Instead of only showing matching rooms, the system gives every room a **match score** for each user.

The score is based on:

* How close it is to the university  
* Whether it matches the user's budget  
* Facilities (WiFi, AC, attached bathroom, etc.)  
* How popular the room is

The system can also:

* Show if the rent is higher or lower than nearby rooms.  
* Push inactive listings lower in search results.

**Why it's better**  
Instead of a simple search, the system recommends the best rooms.

---

### **2\. Shared Wallet & Bill Splitting**

**Current Idea**

* Split expenses equally.  
* Show who paid and who didn't.

  ### **Improved Idea**

Every payment is saved permanently.

The system can also:

* Detect duplicate bills.  
* Warn if a bill is much higher than normal.  
* Reduce unnecessary money transfers.

Example:

Instead of

A → B \= 500

B → C \= 500

C → A \= 500

the system finds a simpler way so fewer payments are needed.

**Why it's better**  
It's smarter and prevents mistakes.

---

### **3\. Maintenance Tickets**

**Current Idea**  
Residents report problems.

### **Improved Idea**

The system decides which problems should be fixed first.

Priority depends on:

* How serious the issue is  
* How many people are affected  
* How long the issue has been waiting

If nobody fixes the issue after a certain time,  
the system automatically reminds the landlord.

If repair cost is high,  
the landlord must approve it before payment.

**Why it's better**

The system manages maintenance automatically instead of waiting for someone to remember.

---

### **Extra Ideas**

* Dashboard showing which rooms need repairs most often.  
* Smart rent calculation based on room size and facilities.  
* Monthly utility bill analysis with future bill prediction.  
  ---

  # **Mahia Tanzin**

  ## **1\. Smart Roommate Matching**

**Current Idea**

Users fill out a profile and the system suggests roommates.

### **Improved Idea**

The system compares users based on:

* Budget  
* Sleeping time  
* Cleanliness  
* Noise tolerance  
* Guest habits  
* Study habits

Instead of random suggestions,  
it recommends roommates who are most compatible.

It also explains **why** they are a good match.

Example:

92% Match

✓ Same sleeping schedule

✓ Similar budget

✗ Different cleanliness habits

**Why it's better**

Users know why someone is recommended.

---

## **2\. Weekly Menu Voting**

**Current Idea**

Everyone votes for meals.

### **Improved Idea**

Instead of selecting only one favorite meal,  
everyone ranks their choices.

The system also:

* Avoids repeating the same food every week.  
* Checks whether meals are balanced.  
* Learns which meals people enjoy most.

**Why it's better**

The final menu is fairer and healthier.

---

## **3\. Google Maps \+ Chore Rotation**

**Current Idea**

Show house location.

Assign chores weekly.

### **Improved Idea**

The system checks whether someone is actually at home before assigning chores.

Instead of rotating equally,  
it checks who has done fewer chores recently.

If someone missed chores because they were away,  
the system adjusts future assignments.

**Why it's better**

Everyone gets a fair share of work.

---

### **Extra Ideas**

* House Reputation Score based on paying bills, completing chores, and attendance.  
* Suggest chores people usually like doing.  
* Predict grocery quantity using previous meal attendance.  
  ---

  # **Md. Mahidul Alam Araf**

  ## **1\. Guest Registration**

**Current Idea**

Residents manually enter guest information.

### **Improved Idea**

When a guest is registered,  
the system creates a QR code.

The QR code is scanned:

* When entering  
* When leaving

Everything is saved automatically.

The system can also notice if someone visits too often.

**Why it's better**

Safer and easier than writing everything manually.

---

## **2\. Meal Attendance**

**Current Idea**

Residents mark whether they'll eat.

### **Improved Idea**

The system predicts how many people will eat using previous weeks' data.

Before everyone responds,  
the cook already gets an estimated number.

After the deadline,  
attendance is locked automatically.

Late users receive reminders.

**Why it's better**

The cook can prepare food more accurately.

---

## **3\. Mess Court**

**Current Idea**

Residents submit disputes.

### **Improved Idea**

Every dispute follows proper steps.

Example:

Raise Complaint

↓

Review

↓

Collect Evidence

↓

Meeting

↓

Decision

↓

Appeal (optional)

↓

Close Case

The system also suggests solutions for common problems like:

* Late payment  
* Skipping chores  
* Noise complaints

Meetings are automatically added to Google Calendar.

**Why it's better**

The whole process becomes organized and fair.

---

### **Extra Ideas**

* Resident Trust Score based on behavior.  
* Emergency Alert button for fire, medical emergencies, or security issues.  
* AI-style dispute assistant that suggests solutions using previous cases.  
  ---

  # **Ideas for the Whole Project**

To make the project look like a real product:

* Add an activity log showing everything happening in the house.  
* Send notifications for bills, chores, and disputes.  
* Show charts for expenses, attendance, and chores.  
* Use background jobs for automatic reminders.  
* Support multiple houses instead of just one.  
* Add real-time updates for voting and maintenance tickets.  
  ---


### **5 Features Most Likely to Impress Faculty at the Demo**

Ranked by (algorithmic depth) × (demo-ability):

1. **Debt Simplification via min-cash-flow (Mehebub)** — shows a messy web of debts collapsing into 2–3 clean transactions live.  
2. **Gale–Shapley Roommate Matching (Tanzin)** — show match scores \+ explanation, and let a faculty member "be a new user" and get matched live.  
3. **Rule-Engine Dispute Assistant (Araf)** — feed in a live mock dispute and show the system suggest a resolution with a confidence score.  
4. **Fairness-Weighted Chore Scheduler (Tanzin)** — a simple dashboard showing effort points equalizing over time is very visual and easy to explain in 30 seconds.  
5. **SLA Escalation \+ Priority Queue (Mehebub)** — demoing a ticket auto-escalating live (or via a "simulate time passing" button) is a great applause moment.

These five, demoed with real (even if seeded/simulated) data and a short "here's the algorithm" explanation on a whiteboard slide, should carry most of the impression — the rest of the feature set supports the narrative that this is a considered, production-style system rather than a set of isolated CRUD screens.

