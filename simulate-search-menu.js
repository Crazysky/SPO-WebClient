/**
 * Simulation of Search Menu URLs
 * Server: 158.69.153.134
 */

const interfaceServerHost = '158.69.153.134';
const interfaceServerPort = 80;
const worldName = 'Shamba';
const tycoonName = 'TestPlayer';
const companyName = 'TestCompany';
const daAddr = '158.69.153.134'; // Assuming DAAddr = interface server
const daPort = 80;

console.log('='.repeat(80));
console.log('SEARCH MENU URL SIMULATION');
console.log('Server: ' + interfaceServerHost);
console.log('World: ' + worldName);
console.log('Tycoon: ' + tycoonName);
console.log('Company: ' + companyName);
console.log('='.repeat(80));
console.log();

// 1. Home Page (DirectoryMain.asp)
console.log('1. HOME PAGE (Categories)');
console.log('-'.repeat(80));
const homePageUrl = `http://${interfaceServerHost}:${interfaceServerPort}/five/0/visual/voyager/new%20directory/DirectoryMain.asp?Tycoon=${encodeURIComponent(tycoonName)}&Company=${encodeURIComponent(companyName)}&WorldName=${encodeURIComponent(worldName)}&DAAddr=${daAddr}&DAPort=${daPort}&RIWS=`;
console.log(homePageUrl);
console.log();

// 2. Towns List
console.log('2. TOWNS LIST (Towns.asp)');
console.log('-'.repeat(80));
const townsUrl = `http://${interfaceServerHost}:${interfaceServerPort}/five/0/visual/voyager/new%20directory/Towns.asp?Tycoon=${encodeURIComponent(tycoonName)}&WorldName=${encodeURIComponent(worldName)}&RIWS=`;
console.log(townsUrl);
console.log();

// 3. Tycoon Profile
console.log('3. TYCOON PROFILE (RenderTycoon.asp)');
console.log('-'.repeat(80));
const exampleTycoonName = 'Morpheus';
const profileUrl = `http://${interfaceServerHost}:${interfaceServerPort}/five/0/visual/voyager/new%20directory/RenderTycoon.asp?WorldName=${encodeURIComponent(worldName)}&Tycoon=${encodeURIComponent(exampleTycoonName)}&RIWS=`;
console.log(profileUrl);
console.log();

// 4. People Search - Index A
console.log('4. PEOPLE SEARCH - Letter A (foundtycoons.asp)');
console.log('-'.repeat(80));
const peopleSearchUrl = `http://${interfaceServerHost}:${interfaceServerPort}/five/0/visual/voyager/new%20directory/foundtycoons.asp?WorldName=${encodeURIComponent(worldName)}&SearchStr=${encodeURIComponent('A')}`;
console.log(peopleSearchUrl);
console.log();

// 5. People Search - Search Query
console.log('5. PEOPLE SEARCH - Search "Test" (foundtycoons.asp)');
console.log('-'.repeat(80));
const peopleSearchQueryUrl = `http://${interfaceServerHost}:${interfaceServerPort}/five/0/visual/voyager/new%20directory/foundtycoons.asp?WorldName=${encodeURIComponent(worldName)}&SearchStr=${encodeURIComponent('Test')}`;
console.log(peopleSearchQueryUrl);
console.log();

// 6. Rankings Tree
console.log('6. RANKINGS TREE (Rankings.asp)');
console.log('-'.repeat(80));
const rankingsUrl = `http://${interfaceServerHost}:${interfaceServerPort}/five/0/visual/voyager/new%20directory/Rankings.asp?Tycoon=${encodeURIComponent(tycoonName)}&WorldName=${encodeURIComponent(worldName)}&RIWS=`;
console.log(rankingsUrl);
console.log();

// 7. Ranking Detail - NTA (from the sample HTML we fetched)
console.log('7. RANKING DETAIL - NTA (ranking.asp)');
console.log('-'.repeat(80));
const rankingPath = 'ranking_nta.asp';
const rankingDetailUrl = `http://${interfaceServerHost}:${interfaceServerPort}/five/0/visual/voyager/new%20directory/ranking.asp?WorldName=${encodeURIComponent(worldName)}&Ranking=${encodeURIComponent(rankingPath)}&frame_Id=RankingView&frame_Class=HTMLView&frame_Align=client&frame_NoBorder=yes&RIWS=&LangId=0`;
console.log(rankingDetailUrl);
console.log();

// 8. Banks
console.log('8. BANKS LIST (Banks.asp)');
console.log('-'.repeat(80));
const banksUrl = `http://${interfaceServerHost}:${interfaceServerPort}/five/0/visual/voyager/new%20directory/Banks.asp?WorldName=${encodeURIComponent(worldName)}&RIWS=`;
console.log(banksUrl);
console.log();

console.log('='.repeat(80));
console.log('IMAGE PROXY EXAMPLES');
console.log('='.repeat(80));
console.log();

// Example image URLs that would be proxied
const exampleImageUrls = [
  '/fivedata/userinfo/Shamba/Morpheus/largephoto.jpg',
  '/five/0/visual/voyager/reports/images/ranking/Companies/MapPGIFoodStore64x32x0.gif',
  'http://158.69.153.134/five/0/visual/voyager/new%20directory/images/townIcon.gif'
];

exampleImageUrls.forEach((imageUrl, index) => {
  console.log(`${index + 1}. Original: ${imageUrl}`);

  let fullUrl = imageUrl;
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    fullUrl = `http://${interfaceServerHost}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
  }

  const proxyUrl = `/proxy-image?url=${encodeURIComponent(fullUrl)}`;
  console.log(`   Proxied: ${proxyUrl}`);
  console.log();
});

console.log('='.repeat(80));
console.log('NOTES');
console.log('='.repeat(80));
console.log('- All HTTP requests use port 80 (standard HTTP)');
console.log('- DAAddr should be retrieved from RDO session (not hardcoded)');
console.log('- Images are automatically proxied through /proxy-image endpoint');
console.log('- RIWS parameter is empty (legacy parameter, not used)');
console.log('- All paths use URL encoding for special characters');
console.log('='.repeat(80));
