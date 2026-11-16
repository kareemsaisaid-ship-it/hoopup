# ข้อมูลเวกเตอร์ไทล์แผนที่ฐาน HoopUp (เขตปทุมวัน - Pilot Basemap)

ไฟล์ `pilot.pmtiles` เป็นไฟล์เวกเตอร์ไทล์รูปแบบ [PMTiles v3](https://protomaps.com/) สำหรับใช้เป็นแผนที่ฐาน (basemap) ภายในแอป HoopUp โดยเซิร์ฟเวอร์ Node.js จะให้บริการไฟล์นี้ผ่าน HTTP Range Requests และแอปจะเรนเดอร์ด้วย `protomaps-leaflet`

## รายละเอียดไฟล์
- **ชื่อไฟล์หลัก**: `pilot.pmtiles` (ทำสำเนามาจาก `pathumwan-z15.pmtiles`)
- **ขนาดไฟล์**: 6,995,684 ไบต์ (~6.67 MB)
- **แหล่งข้อมูลต้นทาง**: Protomaps Daily Planet Build วันที่ 1 พฤศจิกายน 2026 (`https://build.protomaps.com/20261101.pmtiles`)
- **ชุดข้อมูลฐาน**: OpenStreetMap (OSM) ผลิตด้วย Planetiler (v0.10.2) ร่วมกับ Natural Earth
- **ขอบเขตพิกัด (Bounding Box)**:
  - Bbox: `100.50, 13.71, 100.56, 13.77` (min lon, min lat, max lon, max lat)
  - ครอบคลุมพื้นที่เขตปทุมวัน กรุงเทพมหานคร และสนามบาสเกตบอลตามฐานข้อมูลจำนวน 26 สนาม
- **ระดับการซูม (Zoom Levels)**:
  - Min Zoom: 0
  - Max Zoom: 15 (จำนวนไทล์ 95 ไทล์ ครอบคลุมรายละเอียดถนนและอาคารครบถ้วน ทั้งนี้ไคลเอนต์สามารถ overzoom ไปยัง zoom 16+ ได้)

## สิทธิ์การใช้งานและการแสดงเครดิต (Licence & Attribution)
- ข้อมูลแผนที่เผยแพร่ภายใต้สัญญาอนุญาต **Open Database License (ODbL)** ของมูลนิธิ OpenStreetMap
- กฎหมายและเงื่อนไขกำหนดให้ต้องแสดงเครดิตบนหน้าจอแผนที่อย่างชัดเจน (เช่น มุมล่างขวาของแผนที่):
  ```html
  <a href="https://protomaps.com" target="_blank">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>
  ```
- ข้อความ attribution ที่ฝังอยู่ใน PMTiles metadata:
  ```html
  <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap</a>
  ```

## คำสั่งสร้างไฟล์ใหม่ (Regeneration Command)
ใช้เครื่องมือ `pmtiles` CLI (go-pmtiles v1.31.2 ขึ้นไป):
```bash
pmtiles extract https://build.protomaps.com/20261101.pmtiles pilot.pmtiles --bbox=100.50,13.71,100.56,13.77 --maxzoom=15
```
