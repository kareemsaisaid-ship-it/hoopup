import json

with open('C:/D_Drive/terminter01/garage/project_ideas/basketball/app/src/data/osmCourtsBangkok.json', 'r', encoding='utf-8') as f:
    courts = json.load(f)

min_lon, min_lat, max_lon, max_lat = 100.50, 13.71, 100.56, 13.77

non_excluded = [c for c in courts if c.get('osmQuality') != 'excluded']
inside = []
near = []

for c in non_excluded:
    lat = c['latitude']
    lon = c['longitude']
    if min_lon <= lon <= max_lon and min_lat <= lat <= max_lat:
        inside.append(c)
    # Check within margin of 0.02 deg to see if any are on the edge
    elif (min_lon - 0.02) <= lon <= (max_lon + 0.02) and (min_lat - 0.02) <= lat <= (max_lat + 0.02):
        near.append(c)

print(f"Total courts: {len(courts)}")
print(f"Non-excluded courts: {len(non_excluded)}")
print(f"Inside pilot bbox ({min_lon}, {min_lat}, {max_lon}, {max_lat}): {len(inside)}")
for c in inside:
    print(f"- Name: {c.get('name')} | Coordinates: ({c['latitude']}, {c['longitude']}) | osmId: {c.get('osmId')} | osmQuality: {c.get('osmQuality')}")

print("\nNear courts (within 0.02 deg margin):")
for c in near:
    print(f"- Near: {c.get('name')} | Coordinates: ({c['latitude']}, {c['longitude']}) | osmId: {c.get('osmId')}")
