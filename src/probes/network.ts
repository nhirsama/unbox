import type { ProbeDefinition, ProbeSignal } from '../types'
import { createProbeResult, signal, withTimeout } from './utils'

export interface EndpointResult {
  id: string
  label: string
  url: string
  urls?: string[]
  category: string
  region: string
  ok: boolean
  ms: number
  type: 'ip-api' | 'reachability'
  data?: Record<string, unknown>
  error?: string
}

export interface ReachabilityProfile {
  id: string
  label: string
  category: string
  kind: ReachabilityProfileKind
  country?: string
  total: number
  ok: number
  failed: number
  okRate: number
  failRate: number
  medianMs?: number
  baselineMs?: number
  speedRatio?: number
  score: number
  confidence: number
  interpretation: string
  targets: Array<{ id: string; label: string; ok: boolean; ms: number }>
}

export interface NetworkAttributionScore {
  country: string
  label: string
  score: number
  confidence: number
  reasons: string[]
  components: Record<string, number>
}

export interface ProxyPatternScore {
  score: number
  confidence: number
  reasons: string[]
}

export interface NetworkProbeData {
  ipApis: EndpointResult[]
  reachability: EndpointResult[]
  summary: {
    observedIps: Array<{ source: string; ip?: string; country?: string; asn?: string; org?: string }>
    failedCategories: Record<string, number>
    successfulCategories: Record<string, number>
    reachabilityProfiles: ReachabilityProfile[]
    networkAttribution: NetworkAttributionScore[]
    proxyPattern: ProxyPatternScore
  }
}

interface ReachabilityTarget {
  id: string
  label: string
  url: string
  urls?: string[]
  category: string
  region: string
  probe?: 'image'
}

const ipApiEndpoints = [
  { id: 'ipify-v4', label: 'ipify IPv4', url: 'https://api.ipify.org?format=json', region: 'global' },
  { id: 'ipify-v6', label: 'ipify IPv6', url: 'https://api6.ipify.org?format=json', region: 'global' },
  { id: 'ipify-dual', label: 'ipify Dual Stack', url: 'https://api64.ipify.org?format=json', region: 'global' },
  { id: 'ipapi', label: 'ipapi Geo', url: 'https://ipapi.co/json/', region: 'global' },
]

const baseReachabilityTargets: ReachabilityTarget[] = [
  {
    id: 'msft-connect',
    label: 'Microsoft Static Icon',
    url: 'https://www.microsoft.com/favicon.ico',
    category: 'system-connectivity',
    region: 'global',
  },
  {
    id: 'google-204',
    label: 'Google Static Icon',
    url: 'https://www.gstatic.com/images/branding/product/ico/googleg_lodp.ico',
    category: 'system-connectivity',
    region: 'global',
  },
  {
    id: 'apple-captive',
    label: 'Apple Static Icon',
    url: 'https://www.apple.com/favicon.ico',
    category: 'system-connectivity',
    region: 'global',
  },
  {
    id: 'firefox-portal',
    label: 'Mozilla Static Icon',
    url: 'https://www.mozilla.org/media/img/favicons/mozilla/favicon.d25d81d39065.ico',
    category: 'system-connectivity',
    region: 'global',
  },
  {
    id: 'baidu',
    label: 'Baidu',
    url: 'https://www.baidu.com/favicon.ico',
    category: 'cn-mainland',
    region: 'cn',
  },
  {
    id: 'qq',
    label: 'QQ',
    url: 'https://www.qq.com/favicon.ico',
    category: 'cn-mainland',
    region: 'cn',
  },
  {
    id: 'bilibili',
    label: 'Bilibili',
    url: 'https://www.bilibili.com/favicon.ico',
    category: 'cn-mainland',
    region: 'cn',
  },
  {
    id: 'taobao',
    label: 'Taobao',
    url: 'https://www.taobao.com/favicon.ico',
    category: 'cn-mainland',
    region: 'cn',
  },
  {
    id: 'github',
    label: 'GitHub',
    url: 'https://github.com/favicon.ico',
    category: 'developer',
    region: 'global',
  },
  {
    id: 'stackoverflow',
    label: 'Stack Overflow',
    url: 'https://cdn.sstatic.net/Sites/stackoverflow/Img/favicon.ico',
    category: 'developer',
    region: 'global',
  },
  {
    id: 'wikipedia',
    label: 'Wikipedia',
    url: 'https://www.wikipedia.org/static/favicon/wikipedia.ico',
    category: 'knowledge',
    region: 'global',
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    url: 'https://www.cloudflare.com/favicon.ico',
    category: 'cloud',
    region: 'global',
  },
]

const extendedReachabilityTargets: ReachabilityTarget[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    url: 'https://www.youtube.com/favicon.ico',
    category: 'social',
    region: 'global',
  },
  {
    id: 'x',
    label: 'X / Twitter',
    url: 'https://x.com/favicon.ico',
    category: 'social',
    region: 'global',
  },
  {
    id: 'reddit',
    label: 'Reddit',
    url: 'https://www.redditstatic.com/desktop2x/img/favicon/favicon-32x32.png',
    category: 'social',
    region: 'global',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    url: 'https://static.cdninstagram.com/rsrc.php/v4/yI/r/VsNE-OHk_8a.png',
    category: 'social',
    region: 'global',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    url: 'https://static.xx.fbcdn.net/rsrc.php/yB/r/2sFJRNmJ5OP.ico',
    category: 'social',
    region: 'global',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    url: 'https://telegram.org/favicon.ico',
    category: 'social',
    region: 'global',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    url: 'https://www.whatsapp.com/favicon.ico',
    category: 'social',
    region: 'global',
  },
  {
    id: 'signal',
    label: 'Signal',
    url: 'https://signal.org/favicon.ico',
    category: 'social',
    region: 'global',
  },
  {
    id: 'discord',
    label: 'Discord',
    url: 'https://cdn.prod.website-files.com/6257adef93867e50d84d30e2/66e3d7f4ef6498ac018f2c55_favicon.png',
    category: 'social',
    region: 'global',
  },
  {
    id: 'epochtimes',
    label: '大纪元',
    url: 'https://www.epochtimes.com/favicon-32x32.png',
    category: 'blocked-in-cn',
    region: 'global',
  },
  {
    id: 'ntdtv',
    label: '新唐人',
    url: 'https://www.ntdtv.com/favicon-32x32.png',
    category: 'blocked-in-cn',
    region: 'global',
  },
  {
    id: 'minghui',
    label: '明慧网',
    url: 'https://www.minghui.org/favicon.ico',
    category: 'blocked-in-cn',
    region: 'global',
  },
  {
    id: 'rfa',
    label: '自由亚洲电台',
    url: 'https://www.rfa.org/favicon-32x32.png',
    category: 'blocked-in-cn',
    region: 'global',
  },
  {
    id: 'voa-zh',
    label: '美国之音中文',
    url: 'https://www.voachinese.com/Content/responsive/VOA/img/webApp/favicon.ico',
    category: 'blocked-in-cn',
    region: 'global',
  },
  {
    id: 'bbc-zh',
    label: 'BBC 中文',
    url: 'https://static.files.bbci.co.uk/core/website/assets/static/icons/favicon-32.3a402c9d4c6325778b12.png',
    category: 'blocked-in-cn',
    region: 'global',
  },
  {
    id: 'dw-zh',
    label: '德国之声中文',
    url: 'https://static.dw.com/cssi/dw_favicon.png',
    category: 'blocked-in-cn',
    region: 'global',
  },
  {
    id: 'rfi-cn',
    label: '法广中文',
    url: 'https://www.rfi.fr/favicon.ico',
    category: 'blocked-in-cn',
    region: 'global',
  },
  {
    id: 'cdt',
    label: '中国数字时代',
    url: 'https://chinadigitaltimes.net/favicon.ico',
    category: 'blocked-in-cn',
    region: 'global',
  },
  {
    id: 'boxun',
    label: '博讯',
    url: 'https://www.boxun.com/favicon.ico',
    category: 'blocked-in-cn',
    region: 'global',
  },
  {
    id: 'pchome-tw',
    label: 'PChome',
    url: 'https://www.pchome.com.tw/favicon.ico',
    category: 'region-tw',
    region: 'tw',
  },
  {
    id: 'dcard',
    label: 'Dcard',
    url: 'https://www.dcard.tw/favicon.ico',
    category: 'region-tw',
    region: 'tw',
  },
  {
    id: 'ptt',
    label: 'PTT',
    url: 'https://www.ptt.cc/favicon.ico',
    category: 'region-tw',
    region: 'tw',
  },
  {
    id: 'ettoday',
    label: 'ETtoday',
    url: 'https://www.ettoday.net/favicon.ico',
    category: 'region-tw',
    region: 'tw',
  },
  {
    id: 'udn-tw',
    label: '聯合新聞網',
    url: 'https://udn.com/favicon.ico',
    category: 'region-tw',
    region: 'tw',
  },
  {
    id: 'ltn-tw',
    label: '自由時報',
    url: 'https://www.ltn.com.tw/favicon.ico',
    urls: ['https://www.ltn.com.tw/favicon.ico', 'https://news.ltn.com.tw/favicon.ico'],
    category: 'region-tw',
    region: 'tw',
  },
  {
    id: 'momo-tw',
    label: 'momo 購物',
    url: 'https://www.momoshop.com.tw/favicon.ico',
    category: 'region-tw',
    region: 'tw',
  },
  {
    id: 'ruten-tw',
    label: '露天拍賣',
    url: 'https://www.ruten.com.tw/favicon.ico',
    category: 'region-tw',
    region: 'tw',
  },
  {
    id: 'books-tw',
    label: '博客來',
    url: 'https://www.books.com.tw/favicon.ico',
    category: 'region-tw',
    region: 'tw',
  },
  {
    id: 'rthk',
    label: 'RTHK',
    url: 'https://www.rthk.hk/favicon.ico',
    category: 'region-hk',
    region: 'hk',
  },
  {
    id: 'hk01',
    label: 'HK01',
    url: 'https://www.hk01.com/favicon.ico',
    category: 'region-hk',
    region: 'hk',
  },
  {
    id: 'lihkg',
    label: 'LIHKG',
    url: 'https://lihkg.com/favicon.ico',
    category: 'region-hk',
    region: 'hk',
  },
  {
    id: 'openrice-hk',
    label: 'OpenRice',
    url: 'https://www.openrice.com/favicon.ico',
    category: 'region-hk',
    region: 'hk',
  },
  {
    id: 'hket',
    label: '香港經濟日報',
    url: 'https://www.hket.com/favicon.ico',
    category: 'region-hk',
    region: 'hk',
  },
  {
    id: 'mingpao',
    label: '明報',
    url: 'https://www.mingpao.com/favicon.ico',
    urls: ['https://www.mingpao.com/favicon.ico', 'https://news.mingpao.com/favicon.ico'],
    category: 'region-hk',
    region: 'hk',
  },
  {
    id: 'hkgov',
    label: '香港政府一站通',
    url: 'https://www.gov.hk/favicon.ico',
    category: 'region-hk',
    region: 'hk',
  },
  {
    id: 'octopus-hk',
    label: 'Octopus',
    url: 'https://www.octopus.com.hk/favicon.ico',
    category: 'region-hk',
    region: 'hk',
  },
  {
    id: 'price-hk',
    label: 'Price.com.hk',
    url: 'https://www.price.com.hk/favicon.ico',
    category: 'region-hk',
    region: 'hk',
  },
  {
    id: 'yahoo-jp',
    label: 'Yahoo Japan',
    url: 'https://www.yahoo.co.jp/favicon.ico',
    category: 'region-jp',
    region: 'jp',
  },
  {
    id: 'rakuten-jp',
    label: 'Rakuten',
    url: 'https://www.rakuten.co.jp/favicon.ico',
    category: 'region-jp',
    region: 'jp',
  },
  {
    id: 'nicovideo',
    label: 'Niconico',
    url: 'https://www.nicovideo.jp/favicon.ico',
    category: 'region-jp',
    region: 'jp',
  },
  {
    id: 'line',
    label: 'LINE',
    url: 'https://line.me/favicon.ico',
    category: 'region-jp',
    region: 'jp',
  },
  {
    id: 'amazon-jp',
    label: 'Amazon Japan',
    url: 'https://www.amazon.co.jp/favicon.ico',
    category: 'region-jp',
    region: 'jp',
  },
  {
    id: 'mercari-jp',
    label: 'Mercari',
    url: 'https://jp.mercari.com/favicon.ico',
    category: 'region-jp',
    region: 'jp',
  },
  {
    id: 'nhk-jp',
    label: 'NHK',
    url: 'https://www.nhk.or.jp/favicon.ico',
    category: 'region-jp',
    region: 'jp',
  },
  {
    id: 'goo-jp',
    label: 'goo',
    url: 'https://www.goo.ne.jp/favicon.ico',
    category: 'region-jp',
    region: 'jp',
  },
  {
    id: 'jma-jp',
    label: 'Japan Meteorological Agency',
    url: 'https://www.jma.go.jp/favicon.ico',
    category: 'region-jp',
    region: 'jp',
  },
  {
    id: 'naver',
    label: 'Naver',
    url: 'https://www.naver.com/favicon.ico',
    category: 'region-kr',
    region: 'kr',
  },
  {
    id: 'daum',
    label: 'Daum',
    url: 'https://www.daum.net/favicon.ico',
    category: 'region-kr',
    region: 'kr',
  },
  {
    id: 'coupang',
    label: 'Coupang',
    url: 'https://www.coupang.com/favicon.ico',
    category: 'region-kr',
    region: 'kr',
  },
  {
    id: 'kakao',
    label: 'Kakao',
    url: 'https://www.kakao.com/favicon.ico',
    category: 'region-kr',
    region: 'kr',
  },
  {
    id: '11st-kr',
    label: '11st',
    url: 'https://www.11st.co.kr/favicon.ico',
    category: 'region-kr',
    region: 'kr',
  },
  {
    id: 'gmarket-kr',
    label: 'Gmarket',
    url: 'https://www.gmarket.co.kr/favicon.ico',
    category: 'region-kr',
    region: 'kr',
  },
  {
    id: 'tistory-kr',
    label: 'Tistory',
    url: 'https://www.tistory.com/favicon.ico',
    category: 'region-kr',
    region: 'kr',
  },
  {
    id: 'chosun-kr',
    label: 'Chosun',
    url: 'https://www.chosun.com/favicon.ico',
    category: 'region-kr',
    region: 'kr',
  },
  {
    id: 'kbs-kr',
    label: 'KBS',
    url: 'https://www.kbs.co.kr/favicon.ico',
    category: 'region-kr',
    region: 'kr',
  },
  {
    id: 'yandex',
    label: 'Yandex',
    url: 'https://yandex.ru/favicon.ico',
    category: 'region-ru',
    region: 'ru',
  },
  {
    id: 'vk',
    label: 'VK',
    url: 'https://vk.com/favicon.ico',
    category: 'region-ru',
    region: 'ru',
  },
  {
    id: 'ozon',
    label: 'Ozon',
    url: 'https://www.ozon.ru/favicon.ico',
    category: 'region-ru',
    region: 'ru',
  },
  {
    id: 'gosuslugi',
    label: 'Gosuslugi',
    url: 'https://www.gosuslugi.ru/favicon.ico',
    category: 'region-ru',
    region: 'ru',
  },
  {
    id: 'mailru',
    label: 'Mail.ru',
    url: 'https://mail.ru/favicon.ico',
    category: 'region-ru',
    region: 'ru',
  },
  {
    id: 'rambler',
    label: 'Rambler',
    url: 'https://www.rambler.ru/favicon.ico',
    category: 'region-ru',
    region: 'ru',
  },
  {
    id: 'ria',
    label: 'RIA Novosti',
    url: 'https://ria.ru/favicon.ico',
    category: 'region-ru',
    region: 'ru',
  },
  {
    id: 'lenta',
    label: 'Lenta.ru',
    url: 'https://lenta.ru/favicon.ico',
    category: 'region-ru',
    region: 'ru',
  },
  {
    id: 'avito',
    label: 'Avito',
    url: 'https://www.avito.ru/favicon.ico',
    category: 'region-ru',
    region: 'ru',
  },
  {
    id: 'aparat',
    label: 'Aparat',
    url: 'https://www.aparat.com/favicon.ico',
    category: 'region-ir',
    region: 'ir',
  },
  {
    id: 'digikala',
    label: 'Digikala',
    url: 'https://www.digikala.com/favicon.ico',
    category: 'region-ir',
    region: 'ir',
  },
  {
    id: 'varzesh3',
    label: 'Varzesh3',
    url: 'https://www.varzesh3.com/favicon.ico',
    category: 'region-ir',
    region: 'ir',
  },
  {
    id: 'telewebion',
    label: 'Telewebion',
    url: 'https://www.telewebion.com/favicon.ico',
    category: 'region-ir',
    region: 'ir',
  },
  {
    id: 'divar-ir',
    label: 'Divar',
    url: 'https://divar.ir/favicon.ico',
    category: 'region-ir',
    region: 'ir',
  },
  {
    id: 'snapp-ir',
    label: 'Snapp',
    url: 'https://snapp.ir/favicon.ico',
    category: 'region-ir',
    region: 'ir',
  },
  {
    id: 'isna-ir',
    label: 'ISNA',
    url: 'https://www.isna.ir/favicon.ico',
    category: 'region-ir',
    region: 'ir',
  },
  {
    id: 'mehrnews-ir',
    label: 'Mehr News',
    url: 'https://www.mehrnews.com/favicon.ico',
    category: 'region-ir',
    region: 'ir',
  },
  {
    id: 'irna-ir',
    label: 'IRNA',
    url: 'https://www.irna.ir/favicon.ico',
    category: 'region-ir',
    region: 'ir',
  },
  {
    id: 'straitstimes-sg',
    label: 'The Straits Times',
    url: 'https://www.straitstimes.com/favicon.ico',
    category: 'region-sg',
    region: 'sg',
  },
  {
    id: 'channelnewsasia-sg',
    label: 'Channel NewsAsia',
    url: 'https://www.channelnewsasia.com/favicon.ico',
    category: 'region-sg',
    region: 'sg',
  },
  {
    id: 'sg-gov',
    label: 'gov.sg',
    url: 'https://www.gov.sg/favicon.ico',
    category: 'region-sg',
    region: 'sg',
  },
  {
    id: 'dbs-sg',
    label: 'DBS',
    url: 'https://www.dbs.com.sg/favicon.ico',
    category: 'region-sg',
    region: 'sg',
  },
  {
    id: 'carousell-sg',
    label: 'Carousell SG',
    url: 'https://www.carousell.sg/favicon.ico',
    category: 'region-sg',
    region: 'sg',
  },
  {
    id: 'hardwarezone-sg',
    label: 'HardwareZone',
    url: 'https://www.hardwarezone.com.sg/favicon.ico',
    category: 'region-sg',
    region: 'sg',
  },
  {
    id: 'thestar-my',
    label: 'The Star',
    url: 'https://www.thestar.com.my/favicon.ico',
    category: 'region-my',
    region: 'my',
  },
  {
    id: 'malaysiakini-my',
    label: 'Malaysiakini',
    url: 'https://www.malaysiakini.com/favicon.ico',
    category: 'region-my',
    region: 'my',
  },
  {
    id: 'mudah-my',
    label: 'Mudah.my',
    url: 'https://www.mudah.my/favicon.ico',
    category: 'region-my',
    region: 'my',
  },
  {
    id: 'maybank-my',
    label: 'Maybank',
    url: 'https://www.maybank2u.com.my/favicon.ico',
    category: 'region-my',
    region: 'my',
  },
  {
    id: 'lowyat-my',
    label: 'Lowyat.NET',
    url: 'https://www.lowyat.net/favicon.ico',
    category: 'region-my',
    region: 'my',
  },
  {
    id: 'lazada-my',
    label: 'Lazada MY',
    url: 'https://www.lazada.com.my/favicon.ico',
    category: 'region-my',
    region: 'my',
  },
  {
    id: 'sanook-th',
    label: 'Sanook',
    url: 'https://www.sanook.com/favicon.ico',
    category: 'region-th',
    region: 'th',
  },
  {
    id: 'pantip-th',
    label: 'Pantip',
    url: 'https://pantip.com/favicon.ico',
    category: 'region-th',
    region: 'th',
  },
  {
    id: 'thairath-th',
    label: 'Thairath',
    url: 'https://www.thairath.co.th/favicon.ico',
    category: 'region-th',
    region: 'th',
  },
  {
    id: 'khaosod-th',
    label: 'Khaosod',
    url: 'https://www.khaosod.co.th/favicon.ico',
    category: 'region-th',
    region: 'th',
  },
  {
    id: 'lazada-th',
    label: 'Lazada TH',
    url: 'https://www.lazada.co.th/favicon.ico',
    category: 'region-th',
    region: 'th',
  },
  {
    id: 'kapook-th',
    label: 'Kapook',
    url: 'https://www.kapook.com/favicon.ico',
    category: 'region-th',
    region: 'th',
  },
  {
    id: 'vnexpress-vn',
    label: 'VnExpress',
    url: 'https://vnexpress.net/favicon.ico',
    category: 'region-vn',
    region: 'vn',
  },
  {
    id: 'zing-vn',
    label: 'Zing News',
    url: 'https://zingnews.vn/favicon.ico',
    category: 'region-vn',
    region: 'vn',
  },
  {
    id: 'dantri-vn',
    label: 'Dantri',
    url: 'https://dantri.com.vn/favicon.ico',
    category: 'region-vn',
    region: 'vn',
  },
  {
    id: 'tiki-vn',
    label: 'Tiki',
    url: 'https://tiki.vn/favicon.ico',
    category: 'region-vn',
    region: 'vn',
  },
  {
    id: 'thegioididong-vn',
    label: 'The Gioi Di Dong',
    url: 'https://www.thegioididong.com/favicon.ico',
    category: 'region-vn',
    region: 'vn',
  },
  {
    id: 'tuoitre-vn',
    label: 'Tuoi Tre',
    url: 'https://tuoitre.vn/favicon.ico',
    category: 'region-vn',
    region: 'vn',
  },
]

interface ReachabilityProfileGroup {
  id: string
  label: string
  categories: string[]
  kind: ReachabilityProfileKind
  country?: string
  expected: 'reachable' | 'blocked'
}

export type ReachabilityProfileKind = 'baseline' | 'global-service' | 'mainland-service' | 'restriction-signature' | 'regional-service'

const profileGroups: ReachabilityProfileGroup[] = [
  {
    id: 'system-connectivity',
    label: '系统连通性基线',
    categories: ['system-connectivity'],
    kind: 'baseline',
    expected: 'reachable',
  },
  {
    id: 'global-reference',
    label: '全球通用站点基线',
    categories: ['system-connectivity', 'developer', 'knowledge', 'cloud'],
    kind: 'baseline',
    expected: 'reachable',
  },
  {
    id: 'cn-mainland',
    label: '大陆常用站点',
    categories: ['cn-mainland'],
    kind: 'mainland-service',
    country: 'CN',
    expected: 'reachable',
  },
  {
    id: 'blocked-in-cn',
    label: '地缘政治敏感站点阻断特征',
    categories: ['blocked-in-cn'],
    kind: 'restriction-signature',
    country: 'CN',
    expected: 'blocked',
  },
  {
    id: 'social',
    label: '全球社交/通讯站点',
    categories: ['social'],
    kind: 'global-service',
    expected: 'reachable',
  },
  {
    id: 'developer',
    label: '开发者与知识站点',
    categories: ['developer', 'knowledge', 'cloud'],
    kind: 'global-service',
    expected: 'reachable',
  },
  {
    id: 'region-tw',
    label: '繁中地区强地域站点',
    categories: ['region-tw'],
    kind: 'regional-service',
    country: 'TW',
    expected: 'reachable',
  },
  {
    id: 'region-hk',
    label: '香港强地域站点',
    categories: ['region-hk'],
    kind: 'regional-service',
    country: 'HK',
    expected: 'reachable',
  },
  {
    id: 'region-jp',
    label: '日本强地域站点',
    categories: ['region-jp'],
    kind: 'regional-service',
    country: 'JP',
    expected: 'reachable',
  },
  {
    id: 'region-kr',
    label: '韩国强地域站点',
    categories: ['region-kr'],
    kind: 'regional-service',
    country: 'KR',
    expected: 'reachable',
  },
  {
    id: 'region-ru',
    label: '俄罗斯强地域站点',
    categories: ['region-ru'],
    kind: 'regional-service',
    country: 'RU',
    expected: 'reachable',
  },
  {
    id: 'region-ir',
    label: '伊朗强地域站点',
    categories: ['region-ir'],
    kind: 'regional-service',
    country: 'IR',
    expected: 'reachable',
  },
  {
    id: 'region-sg',
    label: '新加坡强地域站点',
    categories: ['region-sg'],
    kind: 'regional-service',
    country: 'SG',
    expected: 'reachable',
  },
  {
    id: 'region-my',
    label: '马来西亚强地域站点',
    categories: ['region-my'],
    kind: 'regional-service',
    country: 'MY',
    expected: 'reachable',
  },
  {
    id: 'region-th',
    label: '泰国强地域站点',
    categories: ['region-th'],
    kind: 'regional-service',
    country: 'TH',
    expected: 'reachable',
  },
  {
    id: 'region-vn',
    label: '越南强地域站点',
    categories: ['region-vn'],
    kind: 'regional-service',
    country: 'VN',
    expected: 'reachable',
  },
]

const regionalProfileCountries: Record<string, string> = {
  'region-tw': 'TW',
  'region-hk': 'HK',
  'region-jp': 'JP',
  'region-kr': 'KR',
  'region-ru': 'RU',
  'region-ir': 'IR',
  'region-sg': 'SG',
  'region-my': 'MY',
  'region-th': 'TH',
  'region-vn': 'VN',
}

const regionalAttributionMinOkRate = 0.9
const regionalStrongOkRate = 0.98

const countryLabels: Record<string, string> = {
  CN: '中国大陆',
  TW: '中国台湾',
  HK: '中国香港',
  JP: '日本',
  KR: '韩国',
  RU: '俄罗斯',
  IR: '伊朗',
  SG: '新加坡',
  MY: '马来西亚',
  TH: '泰国',
  VN: '越南',
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

function median(values: number[]): number | undefined {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (sorted.length === 0) return undefined
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]
}

function normalizeCountryCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(text) ? text : undefined
}

function speedBonus(medianMs?: number, baselineMs?: number): number {
  if (typeof medianMs !== 'number' || typeof baselineMs !== 'number' || baselineMs <= 0) return 0
  const ratio = medianMs / baselineMs
  if (ratio <= 0.55) return 18
  if (ratio <= 0.75) return 14
  if (ratio <= 0.95) return 8
  if (ratio <= 1.2) return 3
  if (ratio >= 2.4) return -10
  if (ratio >= 1.8) return -6
  return 0
}

function scoreProfile(group: ReachabilityProfileGroup, okRate: number, failRate: number, medianMs?: number, baselineMs?: number) {
  const speed = speedBonus(medianMs, baselineMs)
  if (group.kind === 'restriction-signature') {
    return Math.round(clamp(failRate * 100, 0, 100))
  }
  if (group.kind === 'regional-service') {
    if (okRate < regionalAttributionMinOkRate) return Math.round(clamp(okRate * 30, 0, 30))
    return Math.round(clamp(65 + ((okRate - regionalAttributionMinOkRate) / (1 - regionalAttributionMinOkRate)) * 25 + Math.max(0, speed) * 0.55, 0, 100))
  }
  if (group.kind === 'mainland-service') {
    return Math.round(clamp(okRate * 68 + Math.max(0, speed) * 0.45 + (okRate === 1 ? 4 : 0), 0, 88))
  }
  const score = clamp(okRate * 96 + (okRate === 1 ? 4 : 0), 0, 100)
  return Math.round(score)
}

function profileConfidence(total: number, okRate: number, score: number) {
  if (total <= 0) return 0
  const volume = Math.min(0.3, total * 0.028)
  const decisiveness = Math.abs(okRate - 0.5) * 0.28
  const scoreStrength = (score / 100) * 0.18
  return round(clamp(0.28 + volume + decisiveness + scoreStrength, 0.26, 0.9))
}

function describeProfile(group: ReachabilityProfileGroup, ok: number, total: number, okRate: number, failRate: number, medianMs?: number, baselineMs?: number) {
  const medianText = typeof medianMs === 'number' ? `，成功项中位耗时 ${medianMs}ms` : ''
  const speedText =
    typeof medianMs === 'number' && typeof baselineMs === 'number'
      ? `，约为基线 ${round(medianMs / baselineMs, 2)}x`
      : ''

  if (group.kind === 'restriction-signature') {
    if (failRate >= 0.7) return `${ok}/${total} 可达、失败率 ${percent(failRate)}，更接近大陆直连或未完整代理网络${medianText}`
    if (okRate >= 0.7) return `${ok}/${total} 可达，可达率 ${percent(okRate)}，更接近非大陆出口或代理覆盖这些目标${medianText}`
    return `${ok}/${total} 可达，阻断/可达混合，提示分流规则或线路状态不稳定${medianText}`
  }

  if (group.kind === 'regional-service' && okRate < regionalAttributionMinOkRate) {
    return `${ok}/${total} 可达，可达率 ${percent(okRate)}，低于地区归因基本门槛 ${percent(regionalAttributionMinOkRate)}，不作为该地区网络归因${medianText}${speedText}`
  }

  if (okRate >= 0.85) return `${ok}/${total} 可达，可达率 ${percent(okRate)}${medianText}${speedText}`
  if (okRate >= 0.5) return `${ok}/${total} 可达，可达率 ${percent(okRate)}，部分站点失败${medianText}${speedText}`
  return `${ok}/${total} 可达，可达率 ${percent(okRate)}，该组连通性较弱${medianText}${speedText}`
}

function buildReachabilityProfiles(reachability: EndpointResult[]): ReachabilityProfile[] {
  const baselineItems = reachability.filter((item) =>
    ['system-connectivity', 'developer', 'knowledge', 'cloud'].includes(item.category),
  )
  const baselineMs = median(baselineItems.filter((item) => item.ok).map((item) => item.ms))

  return profileGroups
    .map((group) => {
      const items = reachability.filter((item) => group.categories.includes(item.category))
      const total = items.length
      const ok = items.filter((item) => item.ok).length
      const failed = total - ok
      const okRate = total > 0 ? ok / total : 0
      const failRate = total > 0 ? failed / total : 0
      const medianMs = median(items.filter((item) => item.ok).map((item) => item.ms))
      const score = total > 0 ? scoreProfile(group, okRate, failRate, medianMs, baselineMs) : 0
      return {
        id: group.id,
        label: group.label,
        category: group.id,
        kind: group.kind,
        country: group.country,
        total,
        ok,
        failed,
        okRate: round(okRate),
        failRate: round(failRate),
        medianMs,
        baselineMs,
        speedRatio:
          typeof medianMs === 'number' && typeof baselineMs === 'number' && baselineMs > 0 ? round(medianMs / baselineMs) : undefined,
        score,
        confidence: profileConfidence(total, okRate, score),
        interpretation: describeProfile(group, ok, total, okRate, failRate, medianMs, baselineMs),
        targets: items.map((item) => ({ id: item.id, label: item.label, ok: item.ok, ms: item.ms })),
      } satisfies ReachabilityProfile
    })
    .filter((profile) => profile.total > 0)
}

function getProfile(profiles: ReachabilityProfile[], id: string) {
  return profiles.find((profile) => profile.id === id)
}

function addReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) reasons.push(reason)
}

function buildNetworkAttribution(profiles: ReachabilityProfile[]): NetworkAttributionScore[] {
  const attributions: NetworkAttributionScore[] = []
  const cn = getProfile(profiles, 'cn-mainland')
  const blocked = getProfile(profiles, 'blocked-in-cn')
  const social = getProfile(profiles, 'social')

  if (cn) {
    const components: Record<string, number> = {}
    const reasons: string[] = []
    components.cnSites = Math.round(cn.okRate * 12)
    if (cn.okRate >= 0.75) addReason(reasons, `大陆常用站点可达率 ${percent(cn.okRate)}`)
    if (typeof cn.speedRatio === 'number' && cn.speedRatio <= 0.9) {
      components.cnLatency = cn.speedRatio <= 0.65 ? 7 : 3
      addReason(reasons, `大陆常用站点耗时约为全球基线 ${cn.speedRatio}x`)
    }

    if (blocked) {
      components.blockedFailure = Math.round(blocked.failRate * 48)
      if (blocked.failRate >= 0.6) addReason(reasons, `地缘政治敏感站点失败率 ${percent(blocked.failRate)}`)
    }

    if (social) {
      components.socialFailure = Math.round(social.failRate * 24)
      if (social.failRate >= 0.45) addReason(reasons, `全球社交/通讯站点失败率 ${percent(social.failRate)}`)
    }

    if (cn.okRate >= 0.9 && (blocked?.failRate ?? 0) >= 0.65) {
      components.cnBlockedSynergy = 18
      addReason(reasons, '大陆站点可达 + 常见被屏蔽目标不可达的组合特征明显')
    } else if (cn.okRate >= 0.9 && (social?.failRate ?? 0) >= 0.5) {
      components.cnSocialSynergy = 9
      addReason(reasons, '大陆站点可达 + 全球社交站点部分不可达')
    }

    const score = clamp(
      Object.values(components).reduce((sum, value) => sum + value, 0),
      0,
      100,
    )
    const hasRestrictionEvidence = (blocked?.failRate ?? 0) >= 0.55 || (social?.failRate ?? 0) >= 0.5
    if ((hasRestrictionEvidence && cn.okRate >= 0.75 && score >= 38) || (cn.okRate === 1 && score >= 18 && typeof blocked === 'undefined')) {
      attributions.push({
        country: 'CN',
        label: countryLabels.CN,
        score: Math.round(score),
        confidence: round(
          clamp(
            0.24 + score / 190 + (hasRestrictionEvidence ? 0.1 : 0) + Math.min(0.1, (cn.total + (blocked?.total ?? 0) + (social?.total ?? 0)) * 0.005),
            0.28,
            0.88,
          ),
        ),
        reasons: reasons.length > 0 ? reasons : [`大陆常用站点网络分 ${cn.score}/100`],
        components,
      })
    }
  }

  for (const [profileId, country] of Object.entries(regionalProfileCountries)) {
    const profile = getProfile(profiles, profileId)
    if (!profile || profile.total < 3) continue
    if (profile.okRate < regionalAttributionMinOkRate) continue

    const components: Record<string, number> = {
      reachability: Math.round(48 + ((profile.okRate - regionalAttributionMinOkRate) / (1 - regionalAttributionMinOkRate)) * 22),
    }
    const reasons: string[] = [`${profile.label}可达率 ${percent(profile.okRate)}，达到地区归因门槛 ${percent(regionalAttributionMinOkRate)}`]
    if (typeof profile.speedRatio === 'number' && profile.speedRatio <= 0.9) {
      components.latency = profile.speedRatio <= 0.65 ? 14 : 8
      addReason(reasons, `${profile.label}耗时约为全球基线 ${profile.speedRatio}x`)
    }
    if (profile.okRate >= regionalStrongOkRate) components.fullCoverage = 10

    const score = Math.round(clamp(Object.values(components).reduce((sum, value) => sum + value, 0), 0, 92))
    if (score < 50) continue
    attributions.push({
      country,
      label: countryLabels[country] ?? country,
      score,
      confidence: round(clamp(0.24 + score / 230 + Math.min(0.1, profile.total * 0.012), 0.28, 0.66)),
      reasons,
      components,
    })
  }

  return attributions.sort((a, b) => b.score - a.score)
}

function topObservedIpCountry(observedIps: Array<{ country?: string }>): string | undefined {
  const counts = new Map<string, number>()
  for (const item of observedIps) {
    const country = normalizeCountryCode(item.country)
    if (!country) continue
    counts.set(country, (counts.get(country) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

function buildProxyPattern(
  observedIps: Array<{ source: string; ip?: string; country?: string; asn?: string; org?: string }>,
  profiles: ReachabilityProfile[],
  networkAttribution: NetworkAttributionScore[],
): ProxyPatternScore {
  const reasons: string[] = []
  let score = 0
  const ipCountry = topObservedIpCountry(observedIps)
  const ipCountries = new Set(observedIps.map((item) => normalizeCountryCode(item.country)).filter(Boolean))
  const ipSet = new Set(observedIps.map((item) => item.ip).filter(Boolean))
  const cnNetwork = networkAttribution.find((item) => item.country === 'CN')
  const cnProfile = getProfile(profiles, 'cn-mainland')
  const blocked = getProfile(profiles, 'blocked-in-cn')
  const social = getProfile(profiles, 'social')

  if (ipCountries.size >= 2) {
    score += 28
    reasons.push(`不同 IP API 给出多个国家/地区：${[...ipCountries].join('、')}`)
  } else if (ipSet.size >= 2) {
    score += 18
    reasons.push('不同 IP API 观察到多个出口 IP')
  }

  if (ipCountry && ipCountry !== 'CN' && (cnNetwork?.score ?? 0) >= 60) {
    score += 34
    reasons.push(`出口 IP 归到 ${countryLabels[ipCountry] ?? ipCountry}，但连通性矩阵给中国大陆网络环境 ${cnNetwork?.score}/100`)
  }

  if (ipCountry === 'CN' && blocked && blocked.okRate >= 0.65) {
    score += 34
    reasons.push(`出口 IP 归到中国大陆，但 ${percent(blocked.okRate)} 地缘政治敏感站点可达`)
  }

  if (ipCountry === 'CN' && social && social.okRate >= 0.65) {
    score += 18
    reasons.push(`出口 IP 归到中国大陆，但全球社交/通讯站点可达率 ${percent(social.okRate)}`)
  }

  if (ipCountry === 'CN' && cnProfile && cnProfile.okRate <= 0.5) {
    score += 20
    reasons.push(`出口 IP 归到中国大陆，但大陆常用站点可达率仅 ${percent(cnProfile.okRate)}`)
  }

  if (!ipCountry && (blocked?.failRate ?? 0) >= 0.7 && (cnProfile?.okRate ?? 0) >= 0.75) {
    score += 20
    reasons.push('GeoIP 不足，但大陆站点可达 + 地缘政治敏感目标失败的组合明显')
  }

  return {
    score: Math.round(clamp(score, 0, 100)),
    confidence: round(clamp(0.3 + score / 160 + Math.min(0.12, reasons.length * 0.04), 0.3, 0.88)),
    reasons,
  }
}

function normalizeIpApiData(id: string, data: unknown): Record<string, unknown> {
  const obj = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
  return {
    raw: obj,
    ip: obj.ip,
    country: obj.country || obj.country_code,
    city: obj.city,
    region: obj.region,
    asn: obj.asn,
    org: obj.org || obj.as_name,
    timezone: obj.timezone,
    provider: id,
  }
}

async function fetchJsonEndpoint(endpoint: (typeof ipApiEndpoints)[number]): Promise<EndpointResult> {
  const start = performance.now()
  try {
    const data = await withTimeout(async (abortSignal) => {
      const res = await fetch(endpoint.url, {
        cache: 'no-store',
        signal: abortSignal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { Accept: 'application/json,text/plain,*/*' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as unknown
    }, 6500)

    return {
      id: endpoint.id,
      label: endpoint.label,
      url: endpoint.url,
      category: 'ip-api',
      region: endpoint.region,
      ok: true,
      ms: Math.round(performance.now() - start),
      type: 'ip-api',
      data: normalizeIpApiData(endpoint.id, data),
    }
  } catch (error) {
    return {
      id: endpoint.id,
      label: endpoint.label,
      url: endpoint.url,
      category: 'ip-api',
      region: endpoint.region,
      ok: false,
      ms: Math.round(performance.now() - start),
      type: 'ip-api',
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }
  }
}

function imageLoad(url: string, timeoutMs: number): Promise<{ ok: boolean; ms: number; error?: string }> {
  const start = performance.now()
  return new Promise((resolve) => {
    const img = new Image()
    let settled = false
    const timer = window.setTimeout(() => finish(false, 'TimeoutError: image load timed out'), timeoutMs)
    const finish = (ok: boolean, error?: string) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      img.onload = null
      img.onerror = null
      img.src = ''
      resolve({ ok, ms: Math.round(performance.now() - start), error })
    }
    img.decoding = 'async'
    img.referrerPolicy = 'no-referrer'
    img.onload = () => finish(true)
    img.onerror = () => finish(false, 'ImageError: resource failed to load or decode')
    const separator = url.includes('?') ? '&' : '?'
    img.src = `${url}${separator}__probe=${Date.now()}-${Math.random().toString(36).slice(2)}`
  })
}

async function probeReachability(target: ReachabilityTarget): Promise<EndpointResult> {
  const start = performance.now()
  const urls = target.urls && target.urls.length > 0 ? target.urls : [target.url]
  const attempts: Array<{ url: string; ok: boolean; ms: number; error?: string }> = []
  for (const url of urls) {
    const attempt = await imageLoad(url, 4500)
    attempts.push({ url, ...attempt })
    if (attempt.ok) {
      return {
        ...target,
        url,
        urls,
        ok: true,
        ms: Math.round(performance.now() - start),
        type: 'reachability',
        data: {
          method: 'image',
          matchedUrl: url,
          attempts,
          note: 'image onload: HTTP 2xx/3xx 且浏览器可解码为图片',
        },
      }
    }
  }

  return {
    ...target,
    url: target.url,
    urls,
    ok: false,
    ms: Math.round(performance.now() - start),
    type: 'reachability',
    data: {
      method: 'image',
      attempts,
      note: 'image onerror/timeout: 包括 404、403、HTML 错误页、DNS/TLS 阻断或超时',
    },
    error: attempts.map((item) => `${item.url}: ${item.error ?? 'failed'}`).join('; '),
  }
}

function pushCategoryCount(target: Record<string, number>, category: string) {
  target[category] = (target[category] ?? 0) + 1
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await worker(items[current])
    }
  })
  await Promise.all(runners)
  return results
}

export const networkProbe: ProbeDefinition<NetworkProbeData> = {
  id: 'network',
  name: '出口 IP 与连通性矩阵',
  description: '调用公开 IP API 和 HTTPS 公开端点，比较出口 IP 归属、IPv4/IPv6 分流规则与连通性。',
  run: (context) =>
    createProbeResult<NetworkProbeData>(networkProbe, async () => {
      const reachabilityTargets = context.includeSensitiveMatrix
        ? [...baseReachabilityTargets, ...extendedReachabilityTargets]
        : baseReachabilityTargets

      const [ipApis, reachability] = await Promise.all([
        Promise.all(ipApiEndpoints.map(fetchJsonEndpoint)),
        mapLimit(reachabilityTargets, 10, (target) => probeReachability(target)),
      ])

      const observedIps: Array<{ source: string; ip?: string; country?: string; asn?: string; org?: string }> = []
      observedIps.push(
        ...ipApis
          .filter((item) => item.ok)
          .map((item) => ({
            source: item.id,
            ip: String(item.data?.ip ?? ''),
            country: String(item.data?.country ?? ''),
            asn: String(item.data?.asn ?? ''),
            org: String(item.data?.org ?? ''),
          })),
      )

      const failedCategories: Record<string, number> = {}
      const successfulCategories: Record<string, number> = {}
      for (const item of reachability) {
        pushCategoryCount(item.ok ? successfulCategories : failedCategories, item.category)
      }

      const reachabilityProfiles = buildReachabilityProfiles(reachability)
      const networkAttribution = buildNetworkAttribution(reachabilityProfiles)
      const proxyPattern = buildProxyPattern(observedIps, reachabilityProfiles, networkAttribution)

      const data: NetworkProbeData = {
        ipApis,
        reachability,
        summary: {
          observedIps,
          failedCategories,
          successfulCategories,
          reachabilityProfiles,
          networkAttribution,
          proxyPattern,
        },
      }
      const signals: ProbeSignal[] = []

      const uniqueIps = new Set(observedIps.map((x) => x.ip).filter(Boolean))
      if (uniqueIps.size >= 2) {
        signals.push(
          signal(
            'multi-egress-ip',
            'network',
            'high',
            '不同目标观察到不同出口 IP',
            '不同第三方 IP API 看到的出口 IP 不一致，提示代理分流、IPv4/IPv6 分流或规则路由。',
            0.86,
            { observedIps },
          ),
        )
      }

      const v6Result = ipApis.find((x) => x.id === 'ipify-v6')
      const v4Result = ipApis.find((x) => x.id === 'ipify-v4')
      if (v4Result?.ok && !v6Result?.ok) {
        signals.push(
          signal(
            'ipv6-unavailable',
            'network',
            'low',
            'IPv6 出口不可用或被拦截',
            'IPv4 IP API 可达但 IPv6-only API 不可达。',
            0.55,
            { v4: v4Result.data, v6Error: v6Result?.error },
          ),
        )
      }
      if (v4Result?.ok && v6Result?.ok && v4Result.data?.ip !== v6Result.data?.ip) {
        signals.push(
          signal(
            'ipv4-ipv6-split',
            'network',
            'high',
            'IPv4 与 IPv6 出口不同',
            'IPv6 可能绕过代理或走了另一条网络路径。',
            0.84,
            { ipv4: v4Result.data, ipv6: v6Result.data },
          ),
        )
      }

      if (!v4Result?.ok && !v6Result?.ok && !ipApis.some((x) => x.ok)) {
        signals.push(
          signal(
            'ip-api-all-failed',
            'network',
            'medium',
            '公开 IP API 均不可用',
            '多个公开 IP 服务都失败，可能是网络限制、CORS/拦截、DNS 问题或站点本身不可达。',
            0.6,
            { ipApis },
          ),
        )
      }

      const cnFailures = reachability.filter((x) => x.category === 'cn-mainland' && !x.ok).length
      const blockedInCn = reachability.filter((x) => x.category === 'blocked-in-cn')
      const blockedInCnFailures = blockedInCn.filter((x) => !x.ok)
      const blockedInCnSuccess = blockedInCn.filter((x) => x.ok)

      if (cnFailures >= 2) {
        signals.push(
          signal(
            'cn-sites-failed',
            'network',
            'medium',
            '多个大陆常用站点连通失败',
            '大陆常用站点连通失败，可能来自代理规则、DNS、网络阻断或目标站跨域请求策略。',
            0.58,
            { failed: reachability.filter((x) => x.category === 'cn-mainland' && !x.ok) },
          ),
        )
      }

      if (blockedInCn.length >= 4 && blockedInCnFailures.length / blockedInCn.length >= 0.65) {
        signals.push(
          signal(
            'blocked-in-cn-sites-failed',
            'network',
            'high',
            '多个地缘政治敏感站点不可达',
            `${blockedInCnFailures.length}/${blockedInCn.length} 个常见被屏蔽站点访问失败，网络环境更接近中国大陆直连或未完全代理状态。`,
            0.78,
            { failed: blockedInCnFailures, successful: blockedInCnSuccess },
          ),
        )
      } else if (blockedInCn.length >= 4 && blockedInCnSuccess.length / blockedInCn.length >= 0.65) {
        signals.push(
          signal(
            'blocked-in-cn-sites-reachable',
            'network',
            'medium',
            '多个地缘政治敏感站点可达',
            `${blockedInCnSuccess.length}/${blockedInCn.length} 个常见被屏蔽站点访问成功，网络环境更像非大陆出口或代理已覆盖这些目标。`,
            0.66,
            { successful: blockedInCnSuccess, failed: blockedInCnFailures },
          ),
        )
      }

      const cnNetwork = networkAttribution.find((item) => item.country === 'CN')
      if (cnNetwork && cnNetwork.score >= 55) {
        signals.push(
          signal(
            'network-attribution-cn-score',
            'network',
            cnNetwork.score >= 75 ? 'high' : 'medium',
            `中国大陆网络环境分 ${cnNetwork.score}/100`,
            cnNetwork.reasons.join('；'),
            cnNetwork.confidence,
            { attribution: cnNetwork, profiles: reachabilityProfiles },
          ),
        )
      }

      for (const attribution of networkAttribution.filter((item) => item.country !== 'CN' && item.score >= 55).slice(0, 3)) {
        signals.push(
          signal(
            `network-attribution-${attribution.country.toLowerCase()}-score`,
            'network',
            attribution.score >= 72 ? 'medium' : 'low',
            `${attribution.label}网络环境分 ${attribution.score}/100`,
            attribution.reasons.join('；'),
            attribution.confidence,
            { attribution, profiles: reachabilityProfiles.filter((profile) => profile.country === attribution.country) },
          ),
        )
      }

      if (proxyPattern.score >= 35) {
        signals.push(
          signal(
            'proxy-pattern-score',
            'consistency',
            proxyPattern.score >= 70 ? 'high' : proxyPattern.score >= 50 ? 'medium' : 'low',
            `代理/分流异常分 ${proxyPattern.score}/100`,
            proxyPattern.reasons.join('；'),
            proxyPattern.confidence,
            { proxyPattern, observedIps, networkAttribution },
          ),
        )
      }

      return { data, signals }
    }),
}
