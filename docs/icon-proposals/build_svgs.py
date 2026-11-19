from pathlib import Path
from playwright.sync_api import sync_playwright

OUT_DIR = Path(__file__).resolve().parent
SVG_DIR = OUT_DIR / "svg"
PNG_DIR = OUT_DIR / "svg-png"
SVG_DIR.mkdir(parents=True, exist_ok=True)
PNG_DIR.mkdir(parents=True, exist_ok=True)

SCHEMES = [
    {
        "id": "A",
        "slug": "scheme-a-classic-ink",
        "title": "方案 A · 经典墨团站立猫",
        "subtitle": "最贴近《小鸡专注》原版灵魂的纯黑白剪影 IP",
        "features": "侧身站立的圆滚滚小黑猫，保留小鸡专注标志性的「纯黑实心剪影 + 超大白眼圈 + 手绘微毛边 + 极简淡投影」，俏皮翘尾与猫耳让 24px 小尺寸依然一眼辨认是小猫。",
        "svg": """<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512" role="img" aria-label="方案A 经典墨团站立猫">
  <g id="background">
    <rect width="512" height="512" rx="116" fill="#F6F6F4"/>
  </g>
  <g id="shadow">
    <ellipse cx="264" cy="404" rx="92" ry="13" fill="#E3E3DF"/>
  </g>
  <g id="mascot">
    <!-- Playful curled cat tail -->
    <path d="M174 322 C112 316, 92 256, 118 208 C130 186, 152 194, 146 218 C138 250, 154 282, 188 290 Z" fill="#1E1E1E"/>
    <!-- Two slim standing legs with neat cat paws -->
    <path d="M234 344 L230 392 C230 398, 246 399, 253 397 C259 395, 257 387, 247 386 L250 344 Z" fill="#1E1E1E"/>
    <path d="M292 344 L292 392 C292 398, 308 399, 315 397 C321 395, 319 387, 308 386 L308 344 Z" fill="#1E1E1E"/>
    <!-- Chubby fluffy cat silhouette (distinct triangular cat ears + rounded muzzle) -->
    <path d="
      M164 276
      C154 256, 160 232, 180 220
      C178 202, 188 184, 206 178
      L202 114
      C201 100, 216 95, 226 106
      L264 142
      C278 138, 294 138, 308 142
      L338 104
      C348 93, 363 99, 361 114
      L354 162
      C376 178, 388 202, 384 228
      C381 248, 368 264, 344 276
      C354 316, 336 356, 272 358
      C208 360, 168 332, 160 296
      C152 288, 155 280, 164 276
      Z" fill="#1E1E1E"/>
    <!-- Subtle inner haunch highlight for ChickFocus-style depth -->
    <path d="M196 258 C218 248, 248 258, 260 282 C244 300, 208 302, 190 282 C186 272, 190 262, 196 258 Z" fill="#2F2F33"/>
    <!-- Signature oversized white eye + black pupil -->
    <circle cx="316" cy="202" r="36" fill="#FFFFFF"/>
    <circle cx="323" cy="202" r="17" fill="#1E1E1E"/>
    <!-- Tiny coral nose tip on rounded muzzle -->
    <circle cx="378" cy="226" r="6" fill="#EF4E36"/>
    <!-- Crisp whiskers -->
    <path d="M366 238 L398 235 M364 248 L394 254" stroke="#1E1E1E" stroke-width="5.5" stroke-linecap="round"/>
    <!-- Two ChickFocus-style doodle sparks near ear -->
    <path d="M388 122 L405 110 M395 144 L414 141" stroke="#1E1E1E" stroke-width="8" stroke-linecap="round"/>
  </g>
</svg>"""
    },
    {
        "id": "B",
        "slug": "scheme-b-tomato-focus",
        "title": "方案 B · 抱抱番茄专注猫",
        "subtitle": "黑白小猫 × 极简番茄红，点明「番茄专注」主题",
        "features": "正面端坐的圆脸小黑猫，大白眼圈全神贯注盯向前方，怀里抱着一颗高饱和度品牌橙红 (#EF4E36) 极简番茄，兼顾 IP 记忆点与效率工具联想。",
        "svg": """<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512" role="img" aria-label="方案B 抱抱番茄专注猫">
  <g id="background">
    <rect width="512" height="512" rx="116" fill="#FAFAFA"/>
  </g>
  <g id="shadow">
    <ellipse cx="256" cy="414" rx="108" ry="13" fill="#E6E6E3"/>
  </g>
  <g id="mascot">
    <!-- Curled tail on right -->
    <path d="M332 374 C382 376, 408 338, 396 302 C386 274, 360 282, 366 304 C372 326, 356 346, 326 348 Z" fill="#1E1E1E"/>
    <!-- Body -->
    <path d="M168 320 C160 374, 186 408, 256 408 C326 408, 352 374, 344 320 C338 282, 314 256, 256 256 C198 256, 174 282, 168 320 Z" fill="#1E1E1E"/>
    <!-- Head & pointy ears -->
    <path d="
      M148 194
      L134 116
      C132 104, 145 98, 156 106
      L202 142
      C234 130, 278 130, 310 142
      L356 106
      C367 98, 380 104, 378 116
      L364 194
      C378 224, 364 272, 256 272
      C148 272, 134 224, 148 194
      Z" fill="#1E1E1E"/>
    <!-- Inner ears -->
    <path d="M154 130 L185 154 L162 175 Z" fill="#3A3A3E"/>
    <path d="M358 130 L327 154 L350 175 Z" fill="#3A3A3E"/>
    <!-- Oversized ChickFocus-style white eyes -->
    <circle cx="209" cy="204" r="33" fill="#FFFFFF"/>
    <circle cx="303" cy="204" r="33" fill="#FFFFFF"/>
    <circle cx="213" cy="204" r="15" fill="#1E1E1E"/>
    <circle cx="299" cy="204" r="15" fill="#1E1E1E"/>
    <!-- Tiny cute cat nose & mouth -->
    <path d="M251 228 L261 228 L256 235 Z" fill="#FFFFFF"/>
    <path d="M244 240 Q250 247 256 239 Q262 247 268 240" fill="none" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round"/>
    <!-- Minimalist Tomato held in front -->
    <circle cx="256" cy="342" r="56" fill="#EF4E36"/>
    <!-- Tomato calyx leaf -->
    <path d="M256 288 C244 278, 230 284, 232 294 C242 296, 249 296, 256 301 C263 296, 270 296, 280 294 C282 284, 268 278, 256 288 Z" fill="#1E1E1E"/>
    <path d="M256 276 L256 292" stroke="#1E1E1E" stroke-width="6" stroke-linecap="round"/>
    <!-- Clean paws hugging the tomato -->
    <path d="M174 328 C184 316, 210 322, 214 338 C217 352, 198 360, 180 352 Z" fill="#1E1E1E" stroke="#FAFAFA" stroke-width="4" stroke-linejoin="round"/>
    <path d="M338 328 C328 316, 302 322, 298 338 C295 352, 314 360, 332 352 Z" fill="#1E1E1E" stroke="#FAFAFA" stroke-width="4" stroke-linejoin="round"/>
  </g>
</svg>"""
    },
    {
        "id": "C",
        "slug": "scheme-c-night-moon",
        "title": "方案 C · 暗夜月光守望猫",
        "subtitle": "深色模式高级感，夜读与沉浸自习的静谧陪伴",
        "features": "深炭黑夜空底色上嵌一轮暖白满月，纯黑小猫坐在月轮前剪影守望，明亮白眼望向右上角的一颗橙红星点，深色桌面与夜间使用极具高级感。",
        "svg": """<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512" role="img" aria-label="方案C 暗夜月光守望猫">
  <g id="background">
    <rect width="512" height="512" rx="116" fill="#1C1C1E"/>
  </g>
  <g id="moon">
    <circle cx="256" cy="256" r="172" fill="#FAF9F6"/>
  </g>
  <g id="mascot">
    <defs>
      <clipPath id="moonClip">
        <circle cx="256" cy="256" r="172"/>
      </clipPath>
    </defs>
    <g clip-path="url(#moonClip)">
      <!-- Tail sweeping gracefully inside moon -->
      <path d="M294 378 C356 376, 386 330, 372 288 C362 260, 336 270, 344 294 C352 318, 336 346, 290 350 Z" fill="#1C1C1E"/>
      <!-- Sitting cat body -->
      <path d="M170 438 C172 340, 198 282, 248 282 C298 282, 326 340, 328 438 Z" fill="#1C1C1E"/>
      <!-- Tilted head looking up-right -->
      <g transform="rotate(-8 248 228)">
        <path d="
          M168 212
          L160 144
          C159 133, 171 128, 180 136
          L216 168
          C237 159, 265 159, 286 168
          L322 136
          C331 128, 343 133, 342 144
          L334 212
          C344 244, 326 284, 251 284
          C176 284, 158 244, 168 212
          Z" fill="#1C1C1E"/>
        <!-- Bright eyes gazing up toward star -->
        <circle cx="220" cy="218" r="27" fill="#FAF9F6"/>
        <circle cx="284" cy="218" r="27" fill="#FAF9F6"/>
        <circle cx="226" cy="213" r="12" fill="#1C1C1E"/>
        <circle cx="290" cy="213" r="12" fill="#1C1C1E"/>
      </g>
    </g>
    <!-- Single coral focus star inside moon -->
    <path d="M354 162 L361 180 L379 187 L361 194 L354 212 L347 194 L329 187 L347 180 Z" fill="#EF4E36"/>
  </g>
</svg>"""
    },
    {
        "id": "D",
        "slug": "scheme-d-clock-doodle",
        "title": "方案 D · 闹钟猫耳大眼标",
        "subtitle": "强符号化徽章构图，兼顾桌面质感与小尺寸极简识别",
        "features": "把「计时器表盘」与「黑猫大头剪影」合二为一：圆润猫头上方带一只橙红秒表按键与计时弧，大白眼圈自带灵动注视感，头侧配上小鸡专注同款手绘双撇火花。",
        "svg": """<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512" role="img" aria-label="方案D 闹钟猫耳大眼标">
  <g id="background">
    <rect width="512" height="512" rx="116" fill="#F3F3F0"/>
  </g>
  <g id="emblem">
    <!-- Stopwatch top button in brand coral -->
    <rect x="234" y="96" width="44" height="22" rx="10" fill="#EF4E36"/>
    <rect x="247" y="114" width="18" height="20" fill="#EF4E36"/>
    <!-- Clean 25-min timer progress arc wrapping top-right -->
    <path d="M388 158 A 164 164 0 0 1 416 276" fill="none" stroke="#EF4E36" stroke-width="14" stroke-linecap="round"/>
    <!-- Bold cat head silhouette -->
    <path d="
      M130 232
      L114 134
      C111 118, 128 110, 141 121
      L202 168
      C238 154, 274 154, 310 168
      L371 121
      C384 110, 401 118, 398 134
      L382 232
      C406 290, 376 384, 256 384
      C136 384, 106 290, 130 232
      Z" fill="#1E1E1E"/>
    <!-- Giant expressive white eyes -->
    <circle cx="204" cy="264" r="41" fill="#FFFFFF"/>
    <circle cx="308" cy="264" r="41" fill="#FFFFFF"/>
    <circle cx="212" cy="258" r="18" fill="#1E1E1E"/>
    <circle cx="316" cy="258" r="18" fill="#1E1E1E"/>
    <!-- Crisp nose + tiny smile -->
    <path d="M249 308 L263 308 L256 317 Z" fill="#EF4E36"/>
    <path d="M238 328 Q247 338 256 326 Q265 338 274 328" fill="none" stroke="#FFFFFF" stroke-width="5.5" stroke-linecap="round"/>
    <!-- Subtle white cheek whisker ticks -->
    <path d="M144 294 L162 292 M147 312 L164 307 M368 294 L350 292 M365 312 L348 307" stroke="#48484D" stroke-width="5" stroke-linecap="round"/>
    <!-- Hand-drawn ChickFocus doodle spark strokes -->
    <path d="M104 344 L80 356 M112 372 L88 390" stroke="#1E1E1E" stroke-width="10" stroke-linecap="round"/>
  </g>
</svg>"""
    },
    {
        "id": "E",
        "slug": "scheme-e-peeking-buddy",
        "title": "方案 E · 桌沿探头陪伴猫",
        "subtitle": "强情绪互动人设：趴在书桌边陪你一起专注",
        "features": "黑猫从图标下方桌沿探出圆滚滚的小脑袋，两只肉垫小爪搭在横线上，大白眼直勾勾盯着你别摸鱼，耳畔飘起一颗橙红番茄气泡，陪伴感与趣味性最强。",
        "svg": """<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512" role="img" aria-label="方案E 桌沿探头陪伴猫">
  <g id="background">
    <rect width="512" height="512" rx="116" fill="#FFFFFF"/>
  </g>
  <g id="mascot">
    <!-- Peeking round head & ears behind desk bar -->
    <path d="
      M140 352
      C132 310, 138 266, 154 236
      L142 158
      C140 144, 154 136, 166 146
      L210 184
      C234 176, 260 174, 284 178
      L294 155
      C298 147, 308 150, 305 160
      L300 180
      L346 146
      C358 136, 372 144, 370 158
      L358 236
      C374 266, 380 310, 372 352
      Z" fill="#1E1E1E"/>
    <!-- Giant expressive eyes -->
    <circle cx="210" cy="266" r="36" fill="#FFFFFF"/>
    <circle cx="302" cy="266" r="36" fill="#FFFFFF"/>
    <circle cx="216" cy="270" r="17" fill="#1E1E1E"/>
    <circle cx="296" cy="270" r="17" fill="#1E1E1E"/>
    <!-- Tiny white nose -->
    <path d="M250 298 L262 298 L256 305 Z" fill="#FFFFFF"/>
    <!-- Clean desk line -->
    <line x1="84" y1="354" x2="428" y2="354" stroke="#1E1E1E" stroke-width="14" stroke-linecap="round"/>
    <!-- Two cute paws resting over the desk edge -->
    <g>
      <rect x="156" y="332" width="56" height="42" rx="21" fill="#1E1E1E" stroke="#FFFFFF" stroke-width="5"/>
      <rect x="300" y="332" width="56" height="42" rx="21" fill="#1E1E1E" stroke="#FFFFFF" stroke-width="5"/>
      <line x1="175" y1="356" x2="175" y2="369" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="193" y1="356" x2="193" y2="369" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="319" y1="356" x2="319" y2="369" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="337" y1="356" x2="337" y2="369" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round"/>
    </g>
    <!-- Floating coral tomato focus bubble with clean breathing room -->
    <g transform="translate(402, 132)">
      <circle cx="0" cy="0" r="24" fill="#EF4E36"/>
      <path d="M0 -22 C-8 -28, -16 -24, -14 -18 C-7 -17, -3 -16, 0 -13 C3 -16, 7 -17, 14 -18 C16 -24, 8 -28, 0 -22 Z" fill="#1E1E1E"/>
    </g>
    <!-- Two tiny focus doodle marks -->
    <path d="M108 176 L88 166 M104 202 L82 202" stroke="#1E1E1E" stroke-width="8" stroke-linecap="round"/>
  </g>
</svg>"""
    }
]

for item in SCHEMES:
    svg_path = SVG_DIR / f"{item['slug']}.svg"
    svg_path.write_text(item["svg"], encoding="utf-8")

cards_html = ""
for item in SCHEMES:
    cards_html += f"""
    <article class="card">
      <div class="icon-wrap">{item['svg']}</div>
      <div class="meta">
        <h2>{item['title']}</h2>
        <p class="sub">{item['subtitle']}</p>
        <p class="desc">{item['features']}</p>
        <div class="sizes">
          <div class="sz"><span>64px</span><div class="mini s64">{item['svg']}</div></div>
          <div class="sz"><span>40px</span><div class="mini s40">{item['svg']}</div></div>
          <div class="sz"><span>24px</span><div class="mini s24">{item['svg']}</div></div>
        </div>
      </div>
    </article>
    """

html = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>小猫专注 · 图标仿照《小鸡专注》多方案对比</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    padding: 36px 24px 56px;
    background: #EFEFED;
    color: #222222;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  }}
  .wrap {{ max-width: 1120px; margin: 0 auto; }}
  header {{ margin-bottom: 28px; }}
  h1 {{ margin: 0 0 8px; font-size: 26px; font-weight: 700; }}
  .lead {{ margin: 0; color: #5E5E63; font-size: 14px; line-height: 1.7; }}
  .grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
    gap: 20px;
  }}
  .card {{
    background: #FFFFFF;
    border-radius: 24px;
    padding: 22px;
    border: 1px solid #E2E2DF;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }}
  .icon-wrap {{
    display: grid;
    place-items: center;
    background: #F3F3F1;
    border-radius: 18px;
    padding: 22px;
  }}
  .icon-wrap svg {{
    width: 188px;
    height: 188px;
    display: block;
    filter: drop-shadow(0 8px 18px rgba(0,0,0,0.08));
  }}
  h2 {{ margin: 0 0 4px; font-size: 17px; }}
  .sub {{ margin: 0 0 8px; font-size: 13px; color: #EF4E36; font-weight: 600; }}
  .desc {{ margin: 0 0 14px; font-size: 13px; color: #5E5E63; line-height: 1.65; }}
  .sizes {{
    display: flex;
    align-items: flex-end;
    gap: 16px;
    padding-top: 12px;
    border-top: 1px solid #EFEFED;
  }}
  .sz {{ display: flex; flex-direction: column; align-items: center; gap: 6px; }}
  .sz span {{ font-size: 11px; color: #8A8A8E; }}
  .mini svg {{ display: block; width: 100%; height: 100%; }}
  .s64 {{ width: 64px; height: 64px; }}
  .s40 {{ width: 40px; height: 40px; }}
  .s24 {{ width: 24px; height: 24px; }}
  .dock-section {{
    margin-top: 28px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 20px;
  }}
  .wallpaper {{
    border-radius: 24px;
    padding: 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }}
  .wallpaper.light {{ background: linear-gradient(135deg, #EAEBE8, #DDE1DC); color: #222; }}
  .wallpaper.dark {{ background: linear-gradient(135deg, #27282C, #141517); color: #F5F5F5; }}
  .wallpaper h3 {{ margin: 0; font-size: 14px; font-weight: 600; }}
  .app-row {{ display: flex; justify-content: space-between; gap: 10px; }}
  .app-item {{ display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 11px; }}
  .app-item svg {{ width: 54px; height: 54px; border-radius: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.16); }}
</style>
</head>
<body>
  <main class="wrap">
    <header>
      <h1>小猫专注 · 图标设计方案（对标 iOS《小鸡专注》）</h1>
      <p class="lead">提取《小鸡专注》的「实心黑炭剪影 + 超大反差白眼圈 + 手绘呆毛火花 + 克制番茄红点缀」视觉灵魂，设计了 5 个风格各异的矢量方案。</p>
    </header>
    <section class="grid">{cards_html}</section>
    <section class="dock-section">
      <div class="wallpaper light">
        <h3>浅色桌面效果预览</h3>
        <div class="app-row">
          {''.join(f'<div class="app-item">{item["svg"]}<span>方案 {item["id"]}</span></div>' for item in SCHEMES)}
        </div>
      </div>
      <div class="wallpaper dark">
        <h3>深色桌面效果预览</h3>
        <div class="app-row">
          {''.join(f'<div class="app-item">{item["svg"]}<span>方案 {item["id"]}</span></div>' for item in SCHEMES)}
        </div>
      </div>
    </section>
  </main>
</body>
</html>
"""

preview_path = OUT_DIR / "preview.html"
preview_path.write_text(html, encoding="utf-8")

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1220, "height": 1400}, device_scale_factor=2)
    page.goto(preview_path.as_uri())
    page.screenshot(path=str(OUT_DIR / "svg-comparison-sheet.png"), full_page=True)
    for item in SCHEMES:
        page2 = browser.new_page(viewport={"width": 512, "height": 512}, device_scale_factor=2)
        page2.set_content(f"<html><body style='margin:0;background:transparent'>{item['svg'].replace('width=\"1024\" height=\"1024\"', 'width=\"512\" height=\"512\"')}</body></html>")
        page2.screenshot(path=str(PNG_DIR / f"{item['slug']}.png"), omit_background=True)
        page2.close()
    browser.close()

print("Re-rendered refined 5 SVG options and comparison sheet.")
