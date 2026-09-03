// data/ontarioPlaces.js — DayHop V2
// Keyless location suggestions for the "Where?" combobox: Ontario cities,
// towns, GTA neighbourhoods and cottage-country destinations. Matched
// server-side first (routes/geo.js) so a typed prefix never reaches Google
// Places Autocomplete unless it is genuinely outside Ontario — at thousands
// of users, per-keystroke autocomplete was the one call that could leave
// its free tier. Names only: the chosen string is geocoded later through
// the 30-day-cached geocoder like every other picker value.

const P = (name, region) => ({ name, region });

const ONTARIO_PLACES = [
  // Toronto & neighbourhoods
  P('Toronto', 'Toronto'), P('Downtown Toronto', 'Toronto'), P('North York', 'Toronto'), P('Scarborough', 'Toronto'),
  P('Etobicoke', 'Toronto'), P('East York', 'Toronto'), P('York', 'Toronto'), P('The Beaches', 'Toronto'),
  P('Leslieville', 'Toronto'), P('Riverdale', 'Toronto'), P('Danforth', 'Toronto'), P('Cabbagetown', 'Toronto'),
  P('Distillery District', 'Toronto'), P('St. Lawrence Market', 'Toronto'), P('Harbourfront', 'Toronto'),
  P('Liberty Village', 'Toronto'), P('Parkdale', 'Toronto'), P('High Park', 'Toronto'), P('Roncesvalles', 'Toronto'),
  P('The Junction', 'Toronto'), P('Bloor West Village', 'Toronto'), P('The Annex', 'Toronto'), P('Yorkville', 'Toronto'),
  P('Kensington Market', 'Toronto'), P('Chinatown', 'Toronto'), P('Queen West', 'Toronto'), P('King West', 'Toronto'),
  P('Little Italy', 'Toronto'), P('Little Portugal', 'Toronto'), P('Greektown', 'Toronto'), P('Leaside', 'Toronto'),
  P('Davisville', 'Toronto'), P('Midtown Toronto', 'Toronto'), P('Yonge and Eglinton', 'Toronto'), P('Lawrence Park', 'Toronto'),
  P('Forest Hill', 'Toronto'), P('Willowdale', 'Toronto'), P('Don Mills', 'Toronto'), P('Bayview Village', 'Toronto'),
  P('Agincourt', 'Toronto'), P('Rouge', 'Toronto'), P('Scarborough Bluffs', 'Toronto'), P('Toronto Islands', 'Toronto'),
  P('Mimico', 'Toronto'), P('Long Branch', 'Toronto'), P('Rexdale', 'Toronto'), P('Weston', 'Toronto'),
  P('Downsview', 'Toronto'), P('Yorkdale', 'Toronto'), P('Bloordale', 'Toronto'),
  // York Region
  P('Richmond Hill', 'York Region'), P('Markham', 'York Region'), P('Unionville', 'York Region'), P('Thornhill', 'York Region'),
  P('Vaughan', 'York Region'), P('Woodbridge', 'York Region'), P('Maple', 'York Region'), P('Kleinburg', 'York Region'),
  P('Concord', 'York Region'), P('Aurora', 'York Region'), P('Newmarket', 'York Region'), P('King City', 'York Region'),
  P('Nobleton', 'York Region'), P('Schomberg', 'York Region'), P('Stouffville', 'York Region'), P('Whitchurch-Stouffville', 'York Region'),
  P('East Gwillimbury', 'York Region'), P('Holland Landing', 'York Region'), P('Mount Albert', 'York Region'), P('Georgina', 'York Region'),
  P('Keswick', 'York Region'), P('Sutton', 'York Region'), P('Jackson\'s Point', 'York Region'), P('Oak Ridges', 'York Region'),
  // Peel
  P('Mississauga', 'Peel'), P('Port Credit', 'Peel'), P('Streetsville', 'Peel'), P('Erin Mills', 'Peel'), P('Meadowvale', 'Peel'),
  P('Brampton', 'Peel'), P('Bramalea', 'Peel'), P('Caledon', 'Peel'), P('Bolton', 'Peel'), P('Caledon East', 'Peel'),
  P('Belfountain', 'Peel'), P('Cheltenham', 'Peel'),
  // Durham
  P('Pickering', 'Durham'), P('Ajax', 'Durham'), P('Whitby', 'Durham'), P('Brooklin', 'Durham'), P('Oshawa', 'Durham'),
  P('Courtice', 'Durham'), P('Bowmanville', 'Durham'), P('Clarington', 'Durham'), P('Newcastle', 'Durham'),
  P('Port Perry', 'Durham'), P('Scugog', 'Durham'), P('Uxbridge', 'Durham'), P('Beaverton', 'Durham'), P('Cannington', 'Durham'),
  // Halton
  P('Oakville', 'Halton'), P('Bronte', 'Halton'), P('Burlington', 'Halton'), P('Milton', 'Halton'), P('Halton Hills', 'Halton'),
  P('Georgetown', 'Halton'), P('Acton', 'Halton'), P('Campbellville', 'Halton'),
  // Hamilton & Niagara
  P('Hamilton', 'Hamilton'), P('Dundas', 'Hamilton'), P('Ancaster', 'Hamilton'), P('Stoney Creek', 'Hamilton'), P('Waterdown', 'Hamilton'),
  P('Flamborough', 'Hamilton'), P('Grimsby', 'Niagara'), P('Beamsville', 'Niagara'), P('Vineland', 'Niagara'), P('Jordan', 'Niagara'),
  P('St. Catharines', 'Niagara'), P('Niagara Falls', 'Niagara'), P('Niagara-on-the-Lake', 'Niagara'), P('Welland', 'Niagara'),
  P('Port Colborne', 'Niagara'), P('Fort Erie', 'Niagara'), P('Crystal Beach', 'Niagara'), P('Thorold', 'Niagara'), P('Pelham', 'Niagara'),
  P('Fonthill', 'Niagara'), P('Port Dalhousie', 'Niagara'),
  // Simcoe, Barrie & Georgian Bay
  P('Barrie', 'Simcoe'), P('Innisfil', 'Simcoe'), P('Alcona', 'Simcoe'), P('Bradford', 'Simcoe'), P('Bradford West Gwillimbury', 'Simcoe'),
  P('Orillia', 'Simcoe'), P('Midland', 'Simcoe'), P('Penetanguishene', 'Simcoe'), P('Wasaga Beach', 'Simcoe'), P('Collingwood', 'Simcoe'),
  P('Blue Mountain', 'Simcoe'), P('Thornbury', 'Grey'), P('Meaford', 'Grey'), P('Owen Sound', 'Grey'), P('Alliston', 'Simcoe'),
  P('Angus', 'Simcoe'), P('Tottenham', 'Simcoe'), P('Beeton', 'Simcoe'), P('Cookstown', 'Simcoe'), P('Stayner', 'Simcoe'),
  P('Creemore', 'Simcoe'), P('Coldwater', 'Simcoe'), P('Oro-Medonte', 'Simcoe'), P('Horseshoe Valley', 'Simcoe'), P('Tiny', 'Simcoe'),
  P('Tobermory', 'Bruce Peninsula'), P('Sauble Beach', 'Bruce'), P('Lion\'s Head', 'Bruce Peninsula'), P('Wiarton', 'Bruce'),
  // Muskoka, Haliburton, Kawarthas
  P('Muskoka', 'Muskoka'), P('Bracebridge', 'Muskoka'), P('Gravenhurst', 'Muskoka'), P('Huntsville', 'Muskoka'), P('Port Carling', 'Muskoka'),
  P('Bala', 'Muskoka'), P('Baysville', 'Muskoka'), P('Dorset', 'Muskoka'), P('Algonquin Park', 'Algonquin'), P('Haliburton', 'Haliburton'),
  P('Minden', 'Haliburton'), P('Bancroft', 'Hastings'), P('Peterborough', 'Kawarthas'), P('Lakefield', 'Kawarthas'),
  P('Bobcaygeon', 'Kawartha Lakes'), P('Fenelon Falls', 'Kawartha Lakes'), P('Lindsay', 'Kawartha Lakes'), P('Kawartha Lakes', 'Kawartha Lakes'),
  P('Buckhorn', 'Kawarthas'), P('Parry Sound', 'Parry Sound'), P('Killarney', 'Sudbury'),
  // Southwestern Ontario
  P('Guelph', 'Wellington'), P('Elora', 'Wellington'), P('Fergus', 'Wellington'), P('Erin', 'Wellington'), P('Rockwood', 'Wellington'),
  P('Kitchener', 'Waterloo Region'), P('Waterloo', 'Waterloo Region'), P('Cambridge', 'Waterloo Region'), P('St. Jacobs', 'Waterloo Region'),
  P('Elmira', 'Waterloo Region'), P('Stratford', 'Perth'), P('St. Marys', 'Perth'), P('London', 'Middlesex'), P('Port Stanley', 'Elgin'),
  P('Grand Bend', 'Lambton'), P('Bayfield', 'Huron'), P('Goderich', 'Huron'), P('Kincardine', 'Bruce'), P('Port Elgin', 'Bruce'),
  P('Windsor', 'Essex'), P('Kingsville', 'Essex'), P('Leamington', 'Essex'), P('Point Pelee', 'Essex'), P('Pelee Island', 'Essex'),
  P('Sarnia', 'Lambton'), P('Chatham', 'Chatham-Kent'), P('Woodstock', 'Oxford'), P('Brantford', 'Brant'), P('Paris', 'Brant'),
  P('Simcoe', 'Norfolk'), P('Port Dover', 'Norfolk'), P('Turkey Point', 'Norfolk'), P('Long Point', 'Norfolk'),
  P('Orangeville', 'Dufferin'), P('Shelburne', 'Dufferin'), P('Mono', 'Dufferin'), P('Hockley Valley', 'Dufferin'), P('Terra Cotta', 'Halton'),
  // Eastern Ontario
  P('Kingston', 'Frontenac'), P('Gananoque', 'Leeds'), P('Thousand Islands', 'Leeds'), P('Brockville', 'Leeds'), P('Prince Edward County', 'Prince Edward'),
  P('Picton', 'Prince Edward'), P('Wellington', 'Prince Edward'), P('Bloomfield', 'Prince Edward'), P('Sandbanks', 'Prince Edward'),
  P('Belleville', 'Hastings'), P('Trenton', 'Quinte'), P('Cobourg', 'Northumberland'), P('Port Hope', 'Northumberland'),
  P('Brighton', 'Northumberland'), P('Presqu\'ile', 'Northumberland'), P('Ottawa', 'Ottawa'), P('Kanata', 'Ottawa'), P('Nepean', 'Ottawa'),
  P('Orleans', 'Ottawa'), P('Gatineau', 'Outaouais'), P('Perth', 'Lanark'), P('Merrickville', 'Grenville'), P('Cornwall', 'Stormont'),
  P('Pembroke', 'Renfrew'), P('Petawawa', 'Renfrew'), P('Calabogie', 'Renfrew'),
  // Northern Ontario
  P('Sudbury', 'Sudbury'), P('North Bay', 'Nipissing'), P('Sault Ste. Marie', 'Algoma'), P('Manitoulin Island', 'Manitoulin'),
  P('Thunder Bay', 'Thunder Bay'), P('Timmins', 'Cochrane'), P('Temagami', 'Nipissing')
];

module.exports = { ONTARIO_PLACES };
