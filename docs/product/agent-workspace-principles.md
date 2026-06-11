# Agent Workspace Principles

## Product Definition

VisaFlow AI is a working space for a visa agent.

It is not:

- a CRM
- an admin panel
- a form builder
- an AI chat

The main job of the product is to help an agent move a visa case to:

```text
READY FOR OPERATOR REVIEW
```

with the fewest possible mistakes and returns.

## Core User

The primary user is the visa agent.

The agent works with dozens of cases at the same time. Their goals are to:

- not lose documents
- not forget required fields
- find problems quickly
- fix problems quickly
- hand off the case to an operator quickly

The agent does not want to read forms or learn the system.

The agent wants to understand:

- What is broken?
- What should be fixed?
- What is ready?

## Product Promise

VisaFlow does not make visa decisions.

VisaFlow does not promise approval.

VisaFlow helps the agent:

- collect the case
- check readiness
- find missing items
- organize documents
- prepare the case for operator review

## Mental Model

The product is built around tasks.

Not around data.

Not around forms.

Not around documents.

Not around AI.

The main entity is:

```text
CASE
```

A case moves through these states:

```text
Draft
-> In Progress
-> Returned For Fixes
-> Ready For Review
-> Under Review
-> Approved For Submission
```

## Main Workflow

### Step 1: Case Workspace

The agent opens a case and sees:

- case readiness
- blocker count
- applicants
- what requires attention

Primary question:

```text
Where should I start?
```

### Step 2: Choose Applicant

The agent chooses an applicant.

Examples:

- Maria Ivanova
- Anton Ivanov
- Sofia Ivanova

The system shows:

- applicant progress
- applicant problems
- required actions

Primary question:

```text
What is missing for this person?
```

### Step 3: Resolve Tasks

The system shows tasks, not forms.

Examples:

- fill citizenship
- fill birth date
- upload video
- replace passport photo

Primary question:

```text
What do I need to do now?
```

### Step 4: Edit Information

Only after choosing a task does the agent see the form.

Not before.

Structure:

- Profile
- Documents
- Issues

Each section opens only when needed.

### Step 5: Resolve Issues

Every issue must include:

- Problem
- Reason
- Required action

Example:

```text
Problem: Passport is cropped.
Reason: The uploaded image does not include the full spread.
Required action: Upload the full passport spread.
```

Primary question:

```text
How do I fix this?
```

### Step 6: Case Readiness

When problems are resolved, the system shows:

```text
Ready: Yes / No
```

If not ready, show the remaining blockers.

If ready, show the handoff action for operator review.

Primary question:

```text
Can I send this?
```

## Product Architecture

### Level 1: Case

Example:

```text
Ivanov family
```

The case owns:

- overall progress
- overall readiness
- overall blockers

### Level 2: Applicant

Examples:

- Maria
- Anton
- Sofia

Each person is a separate verification unit.

### Level 3: Tasks

Examples:

- Fill citizenship.
- Upload video.
- Fix document.

Tasks are the core of the interface.

### Level 4: Data

Examples:

- questionnaire
- documents
- media

Data is a supporting layer, not the primary interface.

## AI Responsibilities

AI does not make decisions.

AI is not the operator.

AI does not replace the expert.

AI helps the agent work faster.

### AI Function 1: Readiness Assistant

Identify:

- what is missing
- what is complete
- what blocks handoff

### AI Function 2: Issue Aggregation

Collect problems into one list instead of forcing the agent through dozens of screens.

### AI Function 3: Family Analysis

Find possible relationships between applicants.

Examples:

- same address
- same route
- matching surnames

This is a recommendation, not a system decision.

### AI Function 4: Task Prioritization

Help the agent understand:

- what to fix first
- what has the highest impact on case readiness

## AI Must Not

AI must not:

- promise a visa
- calculate approval probability
- make decisions instead of an operator
- imitate official verification
- hide uncertainty

## Design Principles

### 1. Task First

Show the task first.

Then the action.

Then the data.

### 2. Progressive Disclosure

Show only what the agent needs right now.

### 3. Workflow Over Forms

The user should see the work, not the database structure.

### 4. Readiness Driven

The main interface metric is:

```text
Is the case ready for handoff?
```

### 5. Human Confidence

After five seconds on the screen, the agent should understand:

- who needs attention
- how many problems remain
- whether the case can be sent

## Definition Of Great UX

The agent opens a case.

In five seconds, they understand:

- who has problems
- how many problems remain
- what to do next

In thirty seconds, they start fixing a problem.

In a few minutes, they move the case to:

```text
READY FOR REVIEW
```

## Redesign Gate

Before redesigning Agent Workspace, Agent Intake, applicant detail, task lists, readiness panels, issue flows, or AI helper surfaces, Codex must read this document and optimize the UI for this mental model.

Do not optimize around forms, generic dashboards, CRM patterns, or AI chat unless the task explicitly changes the product model.
