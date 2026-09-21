import json,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[1]
# Dates are original works, not the edition recommended by a course.
rows=[
('China in Ten Words','Yu Hua',2010,2010,'CHN','Chinese','Essays & criticism','Ten everyday words frame personal memories and reflections on China’s social transformation.','China_in_Ten_Words'),
('Red Sorghum','Mo Yan',1986,1987,'CHN','Chinese','Novels','Family memory, rural life and wartime violence intertwine across generations in Shandong.','Red_Sorghum_(novel)'),
("Lenin’s Kisses",'Yan Lianke',2004,2004,'CHN','Chinese','Novels','A village becomes entangled in an official’s extravagant scheme in a satire of power and ambition.',"Lenin%27s_Kisses"),
('Waiting','Ha Jin',1999,1999,'CHN','English','Novels','A doctor’s divided loyalties turn a hoped-for new life into years of waiting.','Waiting_(novel)'),
('The Song of Everlasting Sorrow','Wang Anyi',1995,1995,'CHN','Chinese','Novels','A woman’s changing fortunes trace decades of private life in Shanghai.','The_Song_of_Everlasting_Sorrow_(novel)'),
('Labyrinths','Jorge Luis Borges',1935,1960,'ARG','Spanish','Short stories','Stories, essays and parables turn libraries, mirrors and puzzles into questions about reality.','Labyrinths_(short_story_collection)'),
('Conversation in the Cathedral','Mario Vargas Llosa',1969,1969,'PER','Spanish','Novels','A chance conversation opens a complex portrait of private compromise under a Peruvian dictatorship.','Conversation_in_the_Cathedral'),
('2666','Roberto Bolaño',2004,2004,'CHL','Spanish','Novels','Five connected narratives move through literature, obsession and violence toward a Mexican border city.','2666'),
('The Famished Road','Ben Okri',1991,1991,'NGA','English','Novels','A spirit-child moves between worlds while observing the struggles of his family and community.','The_Famished_Road'),
('The Memory of Love','Aminatta Forna',2010,2010,'GBR','English','Novels','Entangled memories and relationships reveal the lasting wounds of conflict in Sierra Leone.','The_Memory_of_Love'),
('Burma Boy','Biyi Bandele',2007,2007,'NGA','English','Novels','A young Nigerian soldier encounters the dangers and absurdities of the Second World War in Burma.','https://macmillan.yale.edu/africa/biyi-bandele'),
('Opening Spaces','Various African women writers; edited by Yvonne Vera',1970,1999,'GHA,ZWE,ZAF,SDN,MUS,CIV,ZMB','English','Short stories','An anthology brings together women’s short fiction from several African literary traditions.','https://books.google.com/books/about/Opening_Spaces.html?id=xbuCAAAAIAAJ'),
('Half of a Yellow Sun','Chimamanda Ngozi Adichie',2006,2006,'NGA','English','Novels','Interwoven lives are transformed by the Biafran war and the pressures it places on love and loyalty.','Half_of_a_Yellow_Sun')]
out=[]
for title,author,a,b,country,lang,cat,overview,ref in rows:
 source=ref if ref.startswith('https:') else 'https://en.wikipedia.org/wiki/'+ref
 countries=country.split(',');bid='path-'+hashlib.sha1((title+author).encode()).hexdigest()[:12]
 note='Original publication date, distinct from later translations and reissues.'
 if title=='Red Sorghum':note='1986–1987 covers the initial publication sequence and collected novel.'
 if title=='Labyrinths':note='Estimated span of the original writings, approximately 1935–1960; the English selection appeared in 1962. Individual components need a full date audit.'
 if title=='Opening Spaces':note='Tentative 1970–1999 contemporary-writing span, not a verified date for each story. The anthology appeared in 1999; component first-publication dates remain to be researched.'
 loc='Author origin in the modern region shown; this is not the story setting or publication location.'
 if title=='The Memory of Love':loc='Aminatta Forna was born in Glasgow (United Kingdom) and grew up partly in Sierra Leone. Sierra Leone is a broader life and literary association, not her birthplace.'
 if title=='Opening Spaces':loc='Representative contributor traditions across Africa; not an exhaustive map, and not based solely on the editor’s birthplace.'
 out.append(dict(id=bid,title=title,author=author,start=a,end=b,countries=countries,associationCountries=list(dict.fromkeys(countries+(['SLE'] if title=='The Memory of Love' else []))),categories=[cat],type='Nonfiction' if cat=='Essays & criticism' else 'Fiction',language=lang,tradition='African' if title=='Opening Spaces' else {'CHN':'Chinese','ARG':'Argentine','PER':'Peruvian','CHL':'Chilean','NGA':'Nigerian','GBR':'Sierra Leonean / British'}.get(country,'World'),overview=overview,source=source,editions=[title+' — see source for edition details'],collections=['Reading path additions'],cover=None,pages=None,goodreads=None,verified=False,dateKind='Original writings' if a!=b else 'Original publication',dateConfidence='estimated' if a!=b else 'documented',dateNote=note,locationBasis='Contributor traditions' if title=='Opening Spaces' else 'Author origin',locationNote=loc,provenance=[dict(fields='Work, original date, overview and literary context',source=source,method='Editorial reading-path addition; approximate spans are labeled.')]))
(R/'data/path-books.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
p=json.loads((R/'data/reading-paths.json').read_text())
for path in p:
 for i in path['items']:
  for b in out:
   if i['title']==b['title']:
    i['bookIds']=[b['id']];i['note']=i['note'].replace('Catalog match pending.','').replace('catalog match pending.','').strip()
(R/'data/reading-paths.json').write_text(json.dumps(p,ensure_ascii=False,indent=2))
print('Added',len(out),'sourced path books')
