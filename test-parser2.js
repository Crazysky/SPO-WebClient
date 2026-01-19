const cheerio = require('cheerio');

const html = `
<html>
<body>
<table>
<tr>
<td align="center" valign="bottom"
    style="border-style: solid; border-width: 2px; border-color: black; cursor: hand"
    onMouseOver="onMouseOverFrame()"
    onMouseOut="onMouseOutFrame()"
    onClick="onKindClick()"
    ref="Towns.asp?Tycoon=Crazz&WorldName=shamba&RIWS="
    normColor="black"
    hiColor="#3A5950">
    <div style="margin-top: 12px">
        <img src="images/smallTowns.jpg" border="0">
    </div>
    <div class="link">
         Towns
    </div>
</td>
</tr>
</table>
</body>
</html>
`;

const $ = cheerio.load(html);

console.log('='.repeat(60));
console.log('CHEERIO ATTRIBUTE PARSING TEST');
console.log('='.repeat(60));

console.log('\nTest 1: Find all td elements');
const tds = $('td');
console.log('  Found:', tds.length, 'td elements');

console.log('\nTest 2: Check attributes on first td');
if (tds.length > 0) {
  const $td = $(tds[0]);
  console.log('  onclick:', $td.attr('onclick'));
  console.log('  onClick:', $td.attr('onClick'));
  console.log('  ref:', $td.attr('ref'));
  console.log('  All attributes:', Object.keys($td[0].attribs));
}

console.log('\nTest 3: Selector tests');
console.log('  td[onclick]:', $('td[onclick]').length);
console.log('  td[onClick]:', $('td[onClick]').length);
console.log('  td[onclick="onKindClick()"]:', $('td[onclick="onKindClick()"]').length);
console.log('  td[ref]:', $('td[ref]').length);

console.log('\nTest 4: Find by attribute value');
$('td').each((i, el) => {
  const $el = $(el);
  const attrs = $el[0].attribs;
  console.log(`  TD ${i} attributes:`, attrs);

  if (attrs.onclick || attrs.onClick) {
    console.log(`    -> Has onclick/onClick`);
  }
  if (attrs.ref) {
    console.log(`    -> ref = ${attrs.ref}`);
  }
});
