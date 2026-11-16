# Notice of Data Attribution and Licensing: Overture Places
# ประกาศแหล่งที่มาและการอนุญาตให้ใช้สิทธิข้อมูล: Overture Places

---

## English

### 1. Data Source and Release
- **Source**: Overture Maps Foundation (Places Theme, Place Type)
- **Release ID**: `2026-10-21.0`
- **S3 Dataset URI**: `s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/type=place/*`
- **Geographic Bounding Box**: Bangkok Metropolitan Area (`minLon: 100.30`, `minLat: 13.50`, `maxLon: 100.95`, `maxLat: 14.10`)
- **Filtered Output File**: `backend/server/data/places-bangkok.ndjson` (156,943 places; deterministic sort by ID)

### 2. Applicable Licences & Reference URLs
Data from Overture Maps Foundation is distributed under open licences according to dataset themes:
1. **CDLA-Permissive-2.0 (Community Data License Agreement – Permissive – Version 2.0)**
   - Licence Text: [https://cdla.dev/permissive-2-0/](https://cdla.dev/permissive-2-0/)
   - Applies to Overture places data and composite attributes.
2. **Apache License 2.0 (Apache-2.0)**
   - Licence Text: [https://www.apache.org/licenses/LICENSE-2.0](https://www.apache.org/licenses/LICENSE-2.0)
   - Applies to code, schemas, and companion software distributed by Overture Maps Foundation.

### 3. Required Attribution
Applications, visualizations, and derivative distributions that display or consume this data must provide visible attribution to Overture Maps Foundation and its data partners.
- **Official Attribution Text**:
  ```text
  Places © Overture Maps Foundation
  ```
- **Attribution Policy Reference**:
  [https://overturemaps.org/attribution-licensing/](https://overturemaps.org/attribution-licensing/)

### 4. Requirement to Ship Licence Text
Under the CDLA Permissive 2.0 agreement, any redistribution of this data (in whole, part, or derived form) must include:
1. This notice file or an equivalent statement identifying the Overture Maps Foundation source.
2. The exact text or canonical URI of the CDLA-Permissive-2.0 licence ([https://cdla.dev/permissive-2-0/](https://cdla.dev/permissive-2-0/)).
3. All existing copyright and provenance notices accompanying the source records.

---

## ภาษาไทย (Thai)

### 1. แหล่งที่มาและรุ่นของข้อมูล (Data Source & Release)
- **ผู้ให้บริการข้อมูล**: Overture Maps Foundation (กลุ่มข้อมูล Places รูปแบบ Place)
- **รหัสรุ่นของข้อมูล (Release ID)**: `2026-10-21.0`
- **ตำแหน่งดาวน์โหลด S3**: `s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/type=place/*`
- **ขอบเขตพิกัดกรุงเทพฯ และปริมณฑล (BBox)**: ลองจิจูด `100.30` ถึง `100.95`, ละติจูด `13.50` ถึง `14.10`
- **ไฟล์ผลลัพธ์ที่ประมวลผลแล้ว**: `backend/server/data/places-bangkok.ndjson` (จำนวน 156,943 สถานที่ คัดกรอง confidence >= 0.70 และเรียงลำดับตาม ID อย่างแน่นอน)

### 2. สัญญาอนุญาตการใช้งานและลิงก์ทางการ (Licences & URLs)
ข้อมูลจาก Overture Maps Foundation เผยแพร่ภายใต้สัญญาอนุญาตแบบเปิด (Open Licences):
1. **CDLA-Permissive-2.0 (Community Data License Agreement – Permissive – Version 2.0)**
   - ลิงก์ข้อความสัญญาอนุญาต: [https://cdla.dev/permissive-2-0/](https://cdla.dev/permissive-2-0/)
   - มีผลบังคับใช้กับชุดข้อมูลสถานที่ (Places theme)
2. **Apache License 2.0 (Apache-2.0)**
   - ลิงก์ข้อความสัญญาอนุญาต: [https://www.apache.org/licenses/LICENSE-2.0](https://www.apache.org/licenses/LICENSE-2.0)
   - มีผลบังคับใช้กับโครงสร้างข้อมูล (schema) และเครื่องมือที่เกี่ยวข้อง

### 3. ข้อความแสดงที่มาที่แอปพลิเคชันต้องแสดง (Attribution Requirement)
แอปพลิเคชันหรือหน้าแผนที่ใด ๆ ที่นำข้อมูลนี้ไปแสดงผล ต้องระบุเครดิตแหล่งที่มาอย่างชัดเจน:
- **ข้อความแสดงเครดิตอย่างเป็นทางการ**:
  ```text
  Places © Overture Maps Foundation
  ```
- **แนวทางการระบุแหล่งที่มา**:
  [https://overturemaps.org/attribution-licensing/](https://overturemaps.org/attribution-licensing/)

### 4. ข้อกำหนดในการส่งมอบสัญญาอนุญาตไปพร้อมกับข้อมูล (Redistribution Notice)
ตามข้อกำหนดของ CDLA Permissive 2.0 การเผยแพร่หรือส่งต่อชุดข้อมูลนี้ (ไม่ว่าทั้งหมด ส่วนใดส่วนหนึ่ง หรือในรูปแบบดัดแปลง) จะต้องแนบข้อความประกาศนี้และลิงก์สัญญาอนุญาต CDLA-Permissive-2.0 ไปด้วยเสมอ
