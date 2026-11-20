# ReliefLink — 5-Minute Executive Demo & Stakeholder Walkthrough

## Target Audience:
UN OCHA, Ethiopian Red Cross Society, Regional Emergency Operations Center (EOC), and Humanitarian Aid Directors.

---

### [00:00 - 01:00] Introduction & The Humanitarian Problem
- **Speaker**: "In crisis zones like Tigray, during sudden flash floods or severe droughts, communication infrastructure breaks down. Citizens are cut off, multiple reports flood in for the same event, and aid providers don't know where supplies are needed most urgently. ReliefLink is built to solve this: an offline-first, multilingual crisis coordination platform that connects affected citizens, ground responders, and aid suppliers in real-time."
- **Visual**: Show homepage (`/`) with Tigray branding and language switcher toggling between English, ትግርኛ, and አማርኛ.

---

### [01:00 - 02:00] Citizen Crisis Reporting & Offline Resilience
- **Speaker**: "Let's simulate a citizen in Ayder, Mekelle. Torrential rain has flooded residential homes."
- **Action**: Open `/report`.
  - Select **Flood**. Describe the emergency.
  - Click **"Use My Current GPS Location"** (or select Ayder landmark).
  - Select **Critical** urgency, 85 people affected, and flag trapped children and elderly.
- **Key Demo Moment**:
  - Open DevTools, switch to **Offline mode** or **Slow 3G**.
  - Submit the report.
  - Show the **"Saved in Offline Queue"** screen with immediate deterministic tracking code `RL-OFFLINE-...`.
  - Toggle network back **Online**. Show the header synchronization icon automatically flashing and syncing the report without user re-entry.

---

### [02:00 - 03:00] Automated Clustering & Responder Priority Triage
- **Speaker**: "Now, let's switch to the Emergency Responder view at the EOC."
- **Action**: Open `/responder`.
  - Point to the triage queue.
  - Show how the report is assigned a high priority score (88+ pts) due to the presence of trapped children and high severity.
  - Point to **Corroborating Reports (3 in cluster)**: PostGIS automatically grouped duplicate calls within 500m into a single operational cluster.
  - Click **"Lock for Triage"** and **"Confirm Verified"**.
  - Formulate an Aid Need: **500 Jerrycans of Clean Water**.

---

### [03:00 - 04:00] Proximity Matching, Provider Dispatch & Zero Double-Allocation
- **Speaker**: "Instantly, ReliefLink's matching engine queries approved NGO depots within radius."
- **Action**:
  - Show the candidate match: **Ethiopian Red Cross - Mekelle Central Depot** (Compatibility Score 94%).
  - Click **"Confirm Match Proposal"**.
  - Switch to Provider view (`/provider`): Show the dispatch alert popping up.
  - Click **"Accept Match"**.
  - Show warehouse stock immediately decrementing with transactional locking — guaranteeing the same aid is never promised twice.
- **Action**: Open `/tasks`. Show field task created: Convoy dispatched, status updated from `ASSIGNED` -> `EN_ROUTE` -> `DONE`.

---

### [04:00 - 05:00] Operations Analytics, Admin Governance & Public Transparency
- **Speaker**: "Finally, coordinators and donors require full operational transparency and compliance."
- **Action**:
  - Open `/operations`: Show live reports over time, SLA averages (verify in 18m, match in 42m), regional unmet needs breakdown, and heat map of incident density across Tigray.
  - Open `/admin`: Show priority formula sliders. Adjust severity weight; show live formula score updating and audit log recording before/after values.
  - Open `/transparency`: Show public aggregate view with zero PII, showcasing verified aid units delivered.
- **Closing**: "ReliefLink delivers end-to-end humanitarian coordination: fast under disaster load, completely resilient offline, and verifiably secure."
