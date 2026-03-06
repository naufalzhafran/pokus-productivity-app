# Product Requirements Document - Pokus Project Management

## 1. Product Overview

Pokus is expanding from a focus/timer app into a comprehensive project management solution with integrated time tracking. Users can now organize their focus sessions into projects and tasks, enabling better productivity tracking and task management.

* **Primary Purpose**: Allow users to create projects, manage tasks within projects, and track time spent on tasks during focus sessions

* **Target Users**: Productivity-focused individuals who want to track time spent on specific projects and tasks

* **Core Value**: Connect focus sessions to specific work items for detailed time analytics

## 2. Core Features

### 2.1 User Roles

| Role               | Registration Method              | Core Permissions                                    |
| ------------------ | -------------------------------- | --------------------------------------------------- |
| Guest User         | Not required                     | Can create focus sessions without task association  |
| Authenticated User | Email/Password via Supabase Auth | Full access to projects, tasks, and session history |

### 2.2 Feature Module

The project management features consist of the following main pages:

1. **Projects Page (Default)**: List all projects with summary stats, create/delete projects - this is the main landing page after login
2. **History Page**: Session history (formerly Dashboard page)
3. **Project Detail Page**: View project details, manage tasks, view time statistics
4. **Focus Page (Enhanced)**: Select task before starting a focus session with search functionality

### 2.3 Page Details

| Page Name           | Module Name    | Feature description                                                |
| ------------------- | -------------- | ------------------------------------------------------------------ |
| Projects Page       | Project List   | Display all user projects with name, task count, completion status |
| Projects Page       | Create Project | Form to create new project with name and description               |
| Projects Page       | Delete Project | Remove project and all associated tasks                            |
| Projects Page       | History Button | Button to navigate to session history                              |
| History Page        | Session List   | Weekly session history with navigation                             |
| Project Detail Page | Task List      | Display all tasks in project with status toggle                    |
| Project Detail Page | Create Task    | Add new task with title and description                            |
| Project Detail Page | Delete Task    | Remove task from project                                           |
| Project Detail Page | Time Summary   | Show total tasks, completed tasks, total time tracked              |
| Project Detail Page | Quick Start    | Button to start focus session directly from task                   |
| Focus Page          | Task Selector  | Dropdown with search to select task (authenticated users)          |
| Focus Page          | Project Tag    | Shows project name as tag for each task in selector                |

### 2.4 URL Routes

| Route           | Purpose                      | Access        |
| --------------- | ---------------------------- | ------------- |
| `/`             | Projects list (main landing) | Authenticated |
| `/history`      | Session history              | Authenticated |
| `/projects`     | Projects list                | Authenticated |
| `/projects/:id` | Project detail with tasks    | Authenticated |
| `/focus`        | Focus timer setup            | Public        |
| `/focus/:id`    | Active focus session         | Public        |
| `/login`        | Login/Register               | Public        |

## 3. Core Process

### User Flows

**Project & Task Management Flow:**

1. User logs in and sees Projects page (main view)
2. User creates a new project with name and description
3. User opens project detail page
4. User creates tasks within the project
5. User can complete, delete, or start focus session from tasks

**Focus Session with Task Flow:**

1. User navigates to Focus page
2. If authenticated, user sees enhanced task selector dropdown
3. User can search tasks by title or project name
4. Selected task shows project name as tag
5. User sets duration and starts session
6. Session is linked to selected task (if any)

### Navigation Flow

```
Home Page
    │
    ├── Login → Projects Page (after auth)
    │              │
    │              ├── History Button → History Page
    │              │
    │              └── Project Card → Project Detail Page
    │                              │
    │                              └── Play Button → Focus Page (with task)
    │
    └── Focus Page (public)
              │
              └── Active Session → Focus Detail Page
```

## 4. User Interface Design

### 4.1 Design Style

* **Primary Color**: #10B981 (Emerald green) - represents focus and productivity

* **Secondary Color**: #6366F1 (Indigo) - for interactive elements

* **Background**: Dark theme with #09090b as base

* **Card Background**: #18181b with subtle borders

* **Typography**: Inter font, 14px base, 18px headings

* **Button Style**: Rounded corners (8px), subtle shadows

* **Layout**: Card-based design with clear visual hierarchy

* **Icons**: Lucide React icons, 16-20px size

### 4.2 Page Design Overview

| Page Name           | Module Name      | UI Elements                                               |
| ------------------- | ---------------- | --------------------------------------------------------- |
| Projects Page       | Header           | Title, History button, New Project button                 |
| Projects Page       | Project Card     | Card with folder icon, name, description, delete on hover |
| Projects Page       | Create Modal     | Modal with name input, description textarea               |
| History Page        | Week Nav         | Chevron buttons, week range, session count                |
| History Page        | Session Item     | Status icon, title, tags, date/time, duration             |
| Project Detail Page | Stats Cards      | 3 cards: Total Tasks, Completed, Total Time               |
| Project Detail Page | Task Section     | To Do / Completed sections with tasks                     |
| Project Detail Page | Task Item        | Checkbox, title, play button, delete button               |
| Focus Page          | Task Selector    | Dropdown with search input, shows task + project tag      |
| Focus Page          | Selected Display | Task title + project name tag                             |

### 4.3 Task Selector UI (Enhanced)

The Focus page task selector now handles many tasks (100+) with:

* **Search input**: Filter tasks by title or project name

* **Clear button**: X button to clear search

* **Project tags**: Each task shows its project name as a small gray tag

* **Scrollable list**: Max height with overflow scroll

* **Empty states**: "No matching tasks" or "No tasks available"

### 4.4 Responsiveness

* **Desktop-first**: Full layout with side-by-side elements

* **Mobile-adaptive**: Single column layout, stacked cards

* **Touch optimization**: Larger tap targets (44px minimum)

## 5. Database Schema

### Tables

1. **projects**: id, user\_id, name, description, created\_at, updated\_at
2. **tasks**: id, user\_id, project\_id, title, description, duration\_minutes, is\_completed, completed\_at, created\_at, updated\_at
3. **pokus\_sessions**: id, user\_id, task\_id (nullable), title, duration, status, tag, started\_at, ended\_at, created\_at

