"""Embed dated, attributed historical context layers without inventing borders.
Original GeoJSON and GPL license are shipped unchanged in the source archive.
Coordinates are normalized to six decimals for stable spherical clipping.
Three-decimal rounding corrupts tiny source rings; source originals are retained.
"""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PRESETS=[
 ('egypt',-1500,'Egypt · New Kingdom','world_bc1500.geojson'),
 ('persia',-500,'Persia & early Greece','world_bc500.geojson'),
 ('greece',-400,'Classical Greece','world_bc400.geojson'),
 ('alexander',-323,'Alexander’s empire','world_bc323.geojson'),
 ('republic',-100,'Roman Republic & Gaul','world_bc100.geojson'),
 ('rome',100,'Roman & Han empires','world_100.geojson'),
 ('late-antiquity',400,'Late antiquity','world_400.geojson'),
 ('byzantium',600,'Byzantium & Sasanian Persia','world_600.geojson'),
 ('tang',800,'Abbasid & Tang worlds','world_800.geojson'),
 ('medieval',1300,'Mali, Yuan & medieval world','world_1300.geojson'),
 ('americas',1492,'Americas & the world','world_1492.geojson'),
 ('ottoman',1600,'Ottoman, Mughal & Ming worlds','world_1600.geojson'),
]
def display_coords(v):
 return [display_coords(x) for x in v] if isinstance(v,list) else round(v,6) if isinstance(v,float) else v

def historical_maps():
 review=json.loads((ROOT/'data/historical/review-1600.json').read_text())
 out=[];source=json.loads((ROOT/'data/historical/source.json').read_text())
 for key,year,label,file in PRESETS:
  data=json.loads((ROOT/'data/historical'/file).read_text());features=[]
  for i,f in enumerate(data['features']):
   p=f['properties'];name=p.get('NAME')
   # Unnamed source areas are displayed as neutral modern land, not invented polities.
   if not name or not f.get('geometry'):continue
   if key=='ottoman' and name in review['omitted']:continue
   f={'type':'Feature','id':f'{key}-{i}','properties':{'name':name,'sovereign':p.get('SUBJECTO') or name,'culture':p.get('PARTOF') or name,'precision':p.get('BORDERPRECISION',1)},'geometry':{'type':f['geometry']['type'],'coordinates':display_coords(f['geometry']['coordinates'])}}
   features.append(f)
  out.append({'id':key,'year':year,'label':label,'file':file,'features':features,'centers':review['centers'] if key=='ottoman' else [],'review':review['note'] if key=='ottoman' else ''})
 return {'presets':out,'source':source}
