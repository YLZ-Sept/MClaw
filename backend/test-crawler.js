const axios = require('axios');
const cheerio = require('cheerio');

async function testSource(name, url, keywords) {
  try {
    console.log('测试:', name, url.substring(0, 50));
    const { data } = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const $ = cheerio.load(data);
    console.log('  页面大小:', data.length, '字节');

    // 统计所有链接
    const links = [];
    $('a').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 10) links.push(text);
    });
    console.log('  链接数:', links.length);

    // 关键词命中
    let hits = 0;
    for (const kw of keywords) {
      const count = links.filter(l => l.includes(kw)).length;
      if (count > 0) { console.log('  "' + kw + '"命中:', count, '条'); hits += count; }
    }
    if (hits === 0 && links.length > 0) {
      console.log('  前5个链接:', links.slice(0, 5).map(l => l.substring(0, 60)));
    }
    return hits;
  } catch(e) {
    console.log('  ERROR:', e.message.substring(0, 100));
    return 0;
  }
}

async function main() {
  const kws = ['网络安全', '等保', '等级保护', '数据安全', '信息化', '系统集成', '终端安全'];
  const sources = [
    { name: '中央政府采购网', url: 'http://www.zycg.gov.cn/freecms/site/zygjjgzfcgzx/tzgg/index.html' },
    { name: '乙方宝', url: 'https://www.yfb.com/bid/list?key=%E7%BD%91%E7%BB%9C%E5%AE%89%E5%85%A8' },
    { name: '云南招标', url: 'http://www.ynzbw.com/' },
    { name: '中国政府采购网-采招', url: 'http://www.ccgp.gov.cn/cggg/zygg/' },
  ];
  let total = 0;
  for (const s of sources) {
    total += await testSource(s.name, s.url, kws);
    console.log('');
  }
  console.log('总命中:', total);
}
main();
