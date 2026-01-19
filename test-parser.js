const cheerio = require('cheerio');

const html = `
<td align="center" valign="bottom"
    style="border-style: solid; border-width: 2px; border-color: black; cursor: hand"
    onMouseOver="onMouseOverFrame()"
    onMouseOut="onMouseOutFrame()"
    onClick="onKindClick()"
    ref="Towns.asp?Tycoon=Crazz&WorldName=shamba&RIWS="
    normColor="black"
    hiColor="#3A5950">
    <div style="margin-top: 12px">
        <img src="images/smallTowns.jpg" border="0"></a>
    </div>
    <div class=link>
         Towns
    </div>
</td>
`;

const $ = cheerio.load(html);

console.log('Test 1: onclick (lowercase)');
console.log('  Found:', $('td[onclick="onKindClick()"]').length);

console.log('\nTest 2: onClick (CamelCase)');
console.log('  Found:', $('td[onClick="onKindClick()"]').length);

console.log('\nTest 3: onclick attribute exists');
console.log('  Found:', $('td[onclick]').length);

console.log('\nTest 4: Direct attribute check');
$('td').each((_, el) => {
  const $el = $(el);
  console.log('  onclick attr:', $el.attr('onclick'));
  console.log('  onClick attr:', $el.attr('onClick'));
  console.log('  ref attr:', $el.attr('ref'));
  console.log('  All attributes:', Object.keys($el[0].attribs));
});
