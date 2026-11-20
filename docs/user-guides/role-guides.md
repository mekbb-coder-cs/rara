# ReliefLink — Role-Based User Manual & Field Guides

This guide describes standard operating procedures for each user role operating on the ReliefLink crisis coordination platform across Tigray.

---

## 1. Civilian / Citizen Guide

### Reporting an Incident (`/report`):
1. **Language Selection**: Select your preferred language (English, ትግርኛ, አማርኛ) in the top-right header.
2. **Step 1 — Hazard Details**: Select the crisis type (Flood, Drought, Medical, Fire, Displacement) and describe what happened (at least 10 characters).
3. **Step 2 — Location**: Click **"Use My Current GPS Location"** or enter a landmark/address in Mekelle, Shire, Adigrat, or Axum.
4. **Step 3 — Urgency & Affected Persons**: Indicate urgency level (Low, Medium, High, Critical) and estimated number of people affected. Check any vulnerable groups trapped (children, elderly, pregnant women, injured).
5. **Step 4 — Photos & Contact**:
   - Optional: Attach compressed photos (all EXIF tracking metadata is stripped).
   - Optional: Enter phone number or toggle **"Submit Anonymously"**.
   - Check the **Consent & Emergency Processing** box.
6. **Submission & Tracking**:
   - If connected, an instant tracking code (e.g. `RL-TIG-4902`) is provided.
   - If offline, the report is securely stored in your phone's offline queue and synced automatically once internet returns.

---

## 2. Emergency Responder Guide (`/responder`)

### Triage & Verification Workflow:
1. **Access Triage Queue**: Responders view incidents sorted dynamically by priority score.
2. **Review Incident Details**: Click an incident card to inspect location, hazard type, affected people count, and corroborating reports in the cluster.
3. **Lock Report**: Click **"Lock for Triage"** to prevent collision with other responders.
4. **Verify Crisis**:
   - Confirm distress details via phone call, radio, satellite feed, or on-site witness.
   - Select verification method and click **"Confirm Verified"**.
5. **Formulate Aid Needs**:
   - Specify aid type (Water, Food, Medical, Shelter, Transport), required quantity, and urgency.
   - The system automatically triggers the matching engine.

---

## 3. Aid Provider / NGO Guide (`/provider`)

### Publishing & Fulfilling Relief Inventory:
1. **Publish Aid Offers**:
   - Register available stock (e.g., 500 clean water jerrycans, 200 trauma kits) at your warehouse or distribution point.
   - Set service radius (e.g., 30km) and availability window.
2. **Review Match Proposals**:
   - When a responder matches your supplies with a verified crisis need, you receive an in-app and SMS dispatch proposal.
3. **Accept / Partial / Decline**:
   - Click **"Accept Match"** to lock inventory and generate dispatch manifests.
   - If capacity is limited, enter partial fulfillment quantity.

---

## 4. Emergency Coordinator Guide (`/coordinator`)

### Situational Awareness & Operational Escalations:
1. **Overview Dashboard**: Monitor real-time map of active emergency incidents vs available supply depots.
2. **Stalled Escalations Queue**:
   - View cases that exceeded unverified or unmatched thresholds (e.g. > 30 minutes unverified).
   - Acknowledge escalations and assign dedicated rapid-response teams.
3. **Broadcast Area Alerts**:
   - Issue public warning banners across Tigray (e.g., "Bridge collapsed on Shire highway. Avoid route B30.").
4. **Live Volunteer Tracking**:
   - Monitor field volunteer GPS locations on active missions with automatic privacy shutoff upon task completion.

---

## 5. System Administrator Guide (`/admin`)

### Governance & System Configuration:
1. **Priority Weights Tuning**: Adjust sliders for severity, affected population, vulnerability, and stall multipliers. All changes are audit-logged with before/after snapshots.
2. **Duplicate Clustering Rules**: Tune PostGIS spatial radius (default 500m) and time window (default 60m).
3. **User & Role Management**: Assign coordinator and responder roles; verify credentials.
4. **Audit Log Inspection**: Review immutable access records and export RFC 4180 CSV logs.
5. **GDPR Data Retention Runner**: Execute retention anonymization job to scrub citizen PII on closed cases older than policy window.
