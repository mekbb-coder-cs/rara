# ReliefLink — System Limitations & Future Innovation Roadmap

## 1. Known Current Limitations

1. **Cellular Dependency for Final Sync**:
   - While reports are queued completely offline in IndexedDB, final transmission to central servers requires intermittent 2G/3G or Wi-Fi uplink.
2. **Browser Storage Eviction Risk**:
   - Mobile Safari or Android Chrome may occasionally evict IndexedDB records if the device runs critically low on physical disk storage (< 100MB free).
3. **SMS Character Budget & Concatenation**:
   - Complex Tigrigna and Amharic text alerts use UTF-16 encoding (UCS-2), reducing single SMS segment lengths from 160 characters to 70 characters, increasing telecom gateway cost.

---

## 2. Future Technological Roadmap

### A. Satellite & Off-Grid Mesh Networking (LoRa / Starlink Direct-to-Cell)
- **Integration with Meshtastic / LoRaWAN**:
  - Deploy sub-GHz LoRa gateways across rural Tigray woredas enabling citizens to transmit compressed binary packets (< 120 bytes) of GPS + Hazard code directly to local responder base stations up to 15km away without cellular infrastructure.
- **Direct-to-Cell Satellite Transceivers**:
  - Integrate emerging 3GPP Non-Terrestrial Networks (NTN) satellite connectivity for remote woredas.

### B. Drone Aerial Mapping & Computer Vision Damage Assessment
- **Ortho-Photomosaic Integration**:
  - Allow humanitarian drone operators (e.g., DJI Terra, WebODM) to upload GeoTIFF raster layers directly into ReliefLink's map view.
- **Automated Flood Inundation & Structural Analysis**:
  - Edge AI models detecting flooded road segments, impassable culverts, and roof collapse to corroborate citizen reports with aerial truth.

### C. AI-Assisted Triage with Human-in-the-Loop Review
- **Multimodal Crisis Classification**:
  - Use lightweight vision-language models to analyze citizen photos, verifying flood water level or structural damage severity and proposing triage tags for responder approval.
- **Human-in-the-Loop Safety Guardrails**:
  - AI NEVER auto-verifies or dispatches; human responders retain 100% decision authority.

### D. Interoperability with Government & International Disaster Frameworks
- **Ethiopian Disaster Risk Management Commission (NDRMC)**:
  - Automated bi-directional data exchange with regional government disaster management dashboards.
- **UN OCHA Humanitarian Data Exchange (HDX) & HXL Standard**:
  - Direct export to Humanitarian Exchange Language (HXL) formatted spreadsheets and Common Operational Datasets (CODs).
