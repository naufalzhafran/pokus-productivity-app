### **Product Requirements Document (PRD)**

| **Project Name** | **Pokus**                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| **Version**      | 1.1                                                                                                  |
| **Status**       | Draft                                                                                                |
| **Platform**     | Web Application (PWA)                                                                                |
| **Core Concept** | A distraction-free deep work environment that separates _Execution_ (Focus) from _Planning_ (Break). |

---

## 1. Problem Statement

- **The Distraction Trap:** Standard productivity tools are cluttered with features (calendars, sub-tasks, comments) that distract users from the actual work.
- **The "Flow" Breaker:** Traditional Pomodoro timers rigidly force breaks, often interrupting users just as they reach peak mental performance (Flow State).
- **Lack of Intent:** Users often start working without defining exactly what "done" looks like, leading to low-quality "shallow work."

## 2. Solution: "Pokus"

Pokus is a web app where the interface adapts to the user's cognitive state.

1. **Focus Mode:** A "Monk Mode" interface. No tasks, no settings, just the current objective and time.
2. **Break Mode:** A "Manager Mode" interface. This is the only time users can organize tasks, check stats, and plan the next session.

---

## 3. Core Features & Requirements

### 3.1 The "Pokus" Entity (Data Model)

A "Pokus" is not just a timer; it is a committed unit of work.

- **Definition:** Every session must be linked to a specific intent.
- **Required Inputs:**
- `Title`: What are you doing? (e.g., "Write API Docs")
- `Duration`: Planned time (default 25m, adjustable).
- `Tag`: (Optional) Project or Goal category.

- **States:** `Planned` -> `In_Progress` -> `Completed` (or `Abandoned`).

### 3.2 Feature: Deep Focus Mode (The "Do" Phase)

- **Best Practice - "Implementation Intention":** The user cannot start the timer until they type exactly what they intend to achieve in this session.
- **Minimalist UI:**
- When the timer starts, the rest of the UI (sidebar, task list, settings) **must disappear**.
- Display only: Large Timer + The "Pokus" Title.

- **Best Practice - "Flow-Modoro":**
- **Soft Alarm:** When time is up, play a subtle sound (a gong or chime), not a jarring alarm.
- **The "Continue" Option:** If the user is in the zone, they can click "Extend (+10m)" to keep working without breaking flow. The break is pushed back.

- **Distraction Blocking:**
- If the user tries to navigate away or pause, show a "Friction Modal": _"Are you sure you want to break focus?"_

### 3.3 Feature: Break Mode (The "Plan" Phase)

- **Context Switch UI:** The background color should change (e.g., from Dark Mode to Light Mode) to visually signal the brain that it is time to rest.
- **The "Batching" Inbox:**
- During the break, the user sees their "Small Task Management" list.
- Users can quick-add tasks that popped into their head during the focus session (to offload them from their brain).

- **Next Pokus Setup:** The user selects the _next_ Pokus _before_ the break ends, reducing friction when starting the next session.

### 3.4 Feature: Gamification & Stats

- **The "Focus Heatmap":** A GitHub-style contribution graph showing which days the user had high focus.
- **Flow Score:** A calculated metric based on:
- Total minutes focused.
- Number of completed Pokus vs. Abandoned Pokus.

- **Badges (Unlockables):**
- _Deep Diver:_ Completed a 90-minute session without pausing.
- _Early Riser:_ Completed a Pokus before 7:00 AM.
- _Streak Master:_ 7 days of consistent focus.

---

## 4. Technical & Non-Functional Requirements

- **Performance:** The app must be "Local-First." It should work offline and sync to the database when the internet returns.
- **Audio Engine:** Built-in "Brown Noise" or "White Noise" generator (optional toggle) to mask background distractions during Focus Mode.
- **Privacy:** Task details should be encrypted or stored locally where possible.

---

## 5. User Interface (UI) Guidelines

- **Micro-interactions:**
- Clicking "Start" should have a satisfying animation (like a shutter closing) to signify "locking in."
