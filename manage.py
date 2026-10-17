#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
胖宝基地 · 内容管理脚本
================================================
交互式菜单：
    python3 manage.py            # 打开菜单
    python3 manage.py menu       # 同上

命令行模式（不依赖 input，永远可靠）：
    python3 manage.py sync       # 同步数据 & 自动注入 HTML 组件
    python3 manage.py list       # 查看所有文章和画作
    python3 manage.py help       # 显示帮助
"""
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

# ============================================================
# 环境准备
# ============================================================
# 强制加载 readline 模块（修复 Linux/Mac 终端下中文输入无法退格/方向键失效的问题）
try:
    import readline
except ImportError:
    pass

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stdin.reconfigure(encoding='utf-8')
    except Exception:
        pass

# ============================================================
# 路径常量
# ============================================================
ROOT = Path(__file__).resolve().parent
ART_DIR    = ROOT / 'arts'
ESSAYS_DIR = ROOT / 'essays'
ARTICLES_JSON = ESSAYS_DIR / 'articles.json'
ARTWORKS_JSON = ART_DIR   / 'artworks.json'
ARTICLES_JS = ROOT / 'articles.js'
ARTWORKS_JS = ROOT / 'artworks.js'
IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.avif'}

# ============================================================
# 基础工具
# ============================================================
def ensure_dirs():
    ART_DIR.mkdir(exist_ok=True)
    ESSAYS_DIR.mkdir(exist_ok=True)

def load_json(path, default=None):
    if default is None: default = []
    if not path.exists(): return list(default)
    try:
        with path.open('r', encoding='utf-8') as f:
            data = json.load(f)
        return data if isinstance(data, list) else list(default)
    except Exception as e:
        print(f'  [警告] 读取 {path.name} 失败：{e}')
        return list(default)

def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def _write_js(path, varname, data):
    header = (
        '// ============================================\n'
        '// 由 manage.py 自动生成\n'
        '// 要添加 / 修改，请运行 manage.py\n'
        '// ============================================\n'
        'window.PB = window.PB || {};\n\n'
        f'PB.{varname} = '
    )
    body = json.dumps(data, ensure_ascii=False, indent=2)
    with path.open('w', encoding='utf-8') as f:
        f.write(header + body + ';\n')

# ============================================================
# ★ 新增：多选解析工具
# ============================================================
def parse_multi_choice(raw, max_n):
    """解析用户输入的多选字符串，如 '1, 3-5, 8' 或 'all'"""
    raw = raw.strip().lower()
    if raw in ('all', '*'):
        return list(range(1, max_n + 1))
    
    results = set()
    # 按逗号分割
    parts = raw.replace('，', ',').split(',')
    for part in parts:
        part = part.strip()
        if not part: continue
        
        # 处理范围 (如 3-5)
        if '-' in part:
            try:
                start, end = map(int, part.split('-'))
                if start > end: start, end = end, start
                for i in range(start, end + 1):
                    if 1 <= i <= max_n: results.add(i)
            except ValueError:
                pass
        # 处理单个数字
        elif part.isdigit():
            n = int(part)
            if 1 <= n <= max_n: results.add(n)
            
    return sorted(list(results), reverse=True)  # 倒序排列，为了安全删除

# ============================================================
# 自动提取封面和注入 HTML
# ============================================================
def extract_cover_from_md(md_rel_path):
    p = ROOT / md_rel_path
    if not p.exists(): return None
    try:
        text = p.read_text(encoding='utf-8')
        m = re.search(r'!\[[^\]]*\]\(\s*([^)\s]+?)(?:\s+["\'][^"\']*["\'])?\s*\)', text)
        if not m: return None
        url = m.group(1).strip()
        url = re.sub(r'^<|>$', '', url)
        url = re.sub(r'^["\']|["\']$', '', url)
        if re.match(r'^(https?:)?//', url) or url.startswith('/') or url.startswith('data:'):
            return url
        url = url.replace('./', '')
        md_dir = md_rel_path.rsplit('/', 1)[0]
        return f"{md_dir}/{url}"
    except Exception:
        return None

def inject_html_components():
    theme_script = """
  <script>
    (function () {
      var t = localStorage.getItem('theme-preference') || 'system';
      var d = t === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : t;
      document.documentElement.setAttribute('data-theme', d);
    })();
  </script>
"""
    nav_common = """
    <div class="theme-switcher" id="themeSwitcher">
      <button class="theme-btn" data-theme-value="light" title="亮色" aria-label="亮色"><i class="fas fa-sun"></i></button>
      <button class="theme-btn" data-theme-value="dark" title="暗色" aria-label="暗色"><i class="fas fa-moon"></i></button>
      <button class="theme-btn" data-theme-value="system" title="跟随系统" aria-label="跟随系统"><i class="fas fa-desktop"></i></button>
    </div>
"""
    nav_index = f"""
  <nav class="topbar" id="topbar">
    <div class="nav-brand">胖宝基地</div>
    <div class="breadcrumb" id="breadcrumb">
      <span class="crumb crumb-home">
        <i class="fas fa-home"></i>
        <span>首页</span>
      </span>
    </div>
    <a class="nav-icon-btn" href="#gallery" title="画" aria-label="画作">
      <i class="fas fa-palette"></i>
    </a>
    {nav_common}
  </nav>
"""
    nav_article = f"""
  <nav class="topbar" id="topbar">
    <a class="back-link" href="index.html" aria-label="返回首页">
      <i class="fas fa-arrow-left"></i>
      <span>返回</span>
    </a>
    <div class="breadcrumb" id="breadcrumb">
      <a class="crumb crumb-home" href="index.html" style="text-decoration:none;">
        <i class="fas fa-home"></i> 首页
      </a>
    </div>
    <a class="nav-icon-btn" href="index.html#gallery" title="画" aria-label="画作">
      <i class="fas fa-palette"></i>
    </a>
    {nav_common}
  </nav>
"""
    nav_about = f"""
  <nav class="topbar">
    <a class="nav-brand" href="index.html" style="text-decoration:none;">胖宝基地</a>
    <div class="breadcrumb">
      <a class="crumb crumb-home" href="index.html" style="text-decoration:none;">
        <i class="fas fa-home"></i> 首页
      </a>
      <span class="crumb-sep">›</span>
      <span class="crumb crumb-file">关于</span>
    </div>
    <a class="nav-icon-btn" href="index.html#gallery" title="画" aria-label="画作">
      <i class="fas fa-palette"></i>
    </a>
    {nav_common}
  </nav>
"""
    footer_html = """
    <footer class="footer">
      &copy; 2026 <span>PangBao</span> · powered by 画画力一族
    </footer>
"""
    def replace_blocks(filepath, nav_html):
        p = ROOT / filepath
        if not p.exists(): return
        content = p.read_text(encoding='utf-8')
        content = re.sub(r'<script>\s*\(function\s*\(\)\s*\{.*?theme-preference.*?\}\)\(\);\s*</script>', theme_script.strip(), content, flags=re.DOTALL)
        content = re.sub(r'<nav class="topbar".*?</nav>', nav_html.strip(), content, flags=re.DOTALL)
        content = re.sub(r'<footer class="footer".*?</footer>', footer_html.strip(), content, flags=re.DOTALL)
        p.write_text(content, encoding='utf-8')

    replace_blocks('index.html', nav_index)
    replace_blocks('article.html', nav_article)
    replace_blocks('about.html', nav_about)

def sync_all():
    articles = load_json(ARTICLES_JSON)
    artworks = load_json(ARTWORKS_JSON)
    updated = False
    for item in articles:
        if 'cover' not in item or not item['cover']:
            cover = extract_cover_from_md(item.get('md', ''))
            if cover:
                item['cover'] = cover
                updated = True
    if updated: save_json(ARTICLES_JSON, articles)
    _write_js(ARTICLES_JS, 'articles', articles)
    _write_js(ARTWORKS_JS, 'artworks', artworks)
    inject_html_components()

def today(): return date.today().isoformat()

def prompt(msg, default=''):
    label = f'{msg} [{default}]：' if default else f'{msg}：'
    try:
        val = input(label).strip()
        return val if val else default
    except KeyboardInterrupt:
        print()
        raise

def ask_choice(msg, max_n, allow_cancel=True):
    while True:
        try: raw = input(msg).strip()
        except KeyboardInterrupt: 
            print()
            raise
        if allow_cancel and raw == '': return None
        if raw.isdigit():
            n = int(raw)
            if 1 <= n <= max_n: return n
        print(f'  请输入 1 ~ {max_n} 之间的数字' + ('，回车取消' if allow_cancel else ''))

def pause(msg='按回车返回菜单…'):
    try: input(f'\n  {msg}')
    except (EOFError, KeyboardInterrupt): print()

def list_art_images():
    if not ART_DIR.exists(): return []
    return sorted(p for p in ART_DIR.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS)

def is_new_structure(md_rel):
    try:
        p = (ROOT / md_rel).resolve()
        return p.suffix.lower() == '.md' and p.parent.parent.resolve() == ESSAYS_DIR.resolve()
    except Exception: return False

def auto_migrate_json():
    if not ARTICLES_JSON.exists() and ARTICLES_JS.exists(): _try_migrate(ARTICLES_JS, ARTICLES_JSON, 'articles')
    if not ARTWORKS_JSON.exists() and ARTWORKS_JS.exists(): _try_migrate(ARTWORKS_JS, ARTWORKS_JSON, 'artworks')

def _try_migrate(js_path, json_path, varname):
    try:
        text = js_path.read_text(encoding='utf-8')
        m = re.search(rf'PB\.{varname}\s*=\s*(\[[\s\S]*?\])\s*;', text)
        if not m: return
        js = m.group(1)
        js = re.sub(r'([{,]\s*)([A-Za-z_][\w-]*)\s*:', r'\1"\2":', js)
        js = re.sub(r"'((?:[^'\\]|\\.)*)'", lambda mm: json.dumps(mm.group(1)), js)
        data = json.loads(js)
        save_json(json_path, data)
    except Exception: pass

# ============================================================
# 业务逻辑
# ============================================================
def add_article():
    print('\n--- 添加文章 ---')
    articles = load_json(ARTICLES_JSON)
    title = prompt('标题')
    if not title: return
    d = prompt('日期 (YYYY-MM-DD)', today())
    folder = prompt('文件夹名', d)
    while (ESSAYS_DIR / folder / f'{folder}.md').exists():
        folder = prompt('换一个文件夹名', folder + '-2')
    post_dir, post_md = ESSAYS_DIR / folder, ESSAYS_DIR / folder / f'{folder}.md'
    desc = prompt('简介（可留空）')
    post_dir.mkdir(parents=True, exist_ok=True)
    if not post_md.exists():
        tpl = f'---\ntitle: {title}\ndate: {d}\n---\n\n# {title}\n\n（在这里写正文…）\n'
        post_md.write_text(tpl, encoding='utf-8')
    item = {'title': title, 'date': d, 'md': f'essays/{folder}/{folder}.md'}
    if desc: item['desc'] = desc
    articles.insert(0, item)
    save_json(ARTICLES_JSON, articles)
    print('  ✓ 文章已添加（数据源已更新，记得同步）')

def list_articles():
    articles = load_json(ARTICLES_JSON)
    print(f'\n--- 文章列表（共 {len(articles)} 篇）---')
    for i, a in enumerate(articles, 1):
        print(f'  {i:>2}. [{a.get("date", "----------")}] {a.get("title", "未命名")} → {a.get("md", "?")}')

def edit_article():
    articles = load_json(ARTICLES_JSON)
    if not articles: return print('\n  没有文章可编辑')
    list_articles()
    n = ask_choice(f'\n  选择要编辑的文章编号 (1-{len(articles)})：', len(articles))
    if n is None: return
    item = articles[n - 1]
    item['title'] = prompt('标题', item.get('title', ''))
    item['date']  = prompt('日期',   item.get('date', ''))
    item['md']    = prompt('md 路径', item.get('md', ''))
    new_desc  = prompt('简介',   item.get('desc', ''))
    if new_desc: item['desc'] = new_desc
    elif 'desc' in item: del item['desc']
    save_json(ARTICLES_JSON, articles)
    print('  ✓ 已保存（数据源已更新，记得同步）')

# ★ 修改：支持批量删除文章
def delete_article():
    articles = load_json(ARTICLES_JSON)
    if not articles: return print('\n  没有文章可删除')
    list_articles()
    
    print('\n  提示：支持输入 1,3,5 或 1-5 或 all 进行批量删除')
    raw = prompt('选择要删除的编号（回车取消）')
    if not raw: return
    
    indexes = parse_multi_choice(raw, len(articles))
    if not indexes: return print('  未选择有效编号，已取消')
    
    print(f'\n  即将删除以下 {len(indexes)} 篇文章：')
    for idx in reversed(indexes):  # 倒序显示，符合原列表顺序
        print(f'    - {articles[idx-1].get("title", "未命名")}')
        
    if prompt('  确认删除？(y/N)', 'N').lower() != 'y': return
    
    # 询问是否删除物理文件
    del_files = prompt('  是否同时删除对应的本地 md 文件夹？(y/N)', 'N').lower() == 'y'
    
    # 倒序删除，防止索引塌陷
    for idx in indexes:
        item = articles.pop(idx - 1)
        if del_files:
            md = item.get('md', '')
            if md:
                post_dir = (ROOT / md).parent
                if post_dir.resolve().parent == ESSAYS_DIR.resolve() and post_dir.exists():
                    shutil.rmtree(post_dir)
                    
    save_json(ARTICLES_JSON, articles)
    print(f'  ✓ 已移除 {len(indexes)} 篇文章（记得同步）')

def migrate_to_folders():
    print('\n--- 迁移为文件夹结构 ---')
    articles = load_json(ARTICLES_JSON)
    migrated, new_articles = 0, []
    for item in articles:
        old_md = item.get('md', '')
        if not old_md or is_new_structure(old_md):
            new_articles.append(item); continue
        md_path = ROOT / old_md
        if md_path.parent.resolve() != ESSAYS_DIR.resolve() or not md_path.exists():
            new_articles.append(item); continue
        stem, new_dir, new_md = md_path.stem, ESSAYS_DIR / md_path.stem, ESSAYS_DIR / md_path.stem / f'{md_path.stem}.md'
        if new_md.exists(): new_articles.append(item); continue
        new_dir.mkdir(parents=True, exist_ok=True)
        shutil.move(str(md_path), str(new_md))
        new_item = dict(item)
        new_item['md'] = f'essays/{stem}/{stem}.md'
        new_articles.append(new_item); migrated += 1
    if migrated > 0:
        save_json(ARTICLES_JSON, new_articles)
        print(f'\n  ✓ 共迁移 {migrated} 篇（记得同步）')

def pick_image():
    imgs = list_art_images()
    if imgs:
        for i, p in enumerate(imgs, 1): print(f'    {i:>3}. {p.name}')
        raw = input('\n  输入编号选择，或直接输入文件名：').strip()
        if not raw: return None
        if raw.isdigit() and 1 <= int(raw) <= len(imgs): return f'arts/{imgs[int(raw)-1].name}'
        if raw.startswith(('arts/', 'http')): return raw
        if (ART_DIR / raw).exists(): return f'arts/{raw}'
        return raw
    return input('\n  直接输入路径（如 arts/xxx.jpg）：').strip() or None

def add_artwork():
    print('\n--- 添加画作 ---')
    artworks = load_json(ARTWORKS_JSON)
    src = pick_image()
    if not src: return
    title = prompt('标题', Path(src).stem)
    d = prompt('日期 (YYYY-MM-DD)', today())
    tags = [t.strip() for t in prompt('标签（逗号分隔）').replace('，', ',').split(',') if t.strip()]
    item = {'src': src, 'title': title, 'date': d}
    if tags: item['tags'] = tags
    artworks.insert(0, item)
    save_json(ARTWORKS_JSON, artworks)
    print('  ✓ 画作已添加（记得同步）')

def list_artworks():
    artworks = load_json(ARTWORKS_JSON)
    print(f'\n--- 画作列表（共 {len(artworks)} 张）---')
    for i, a in enumerate(artworks, 1):
        print(f'  {i:>2}. [{a.get("date", "----------")}] {a.get("title", "未命名")} → {a.get("src", "?")}')

def edit_artwork():
    artworks = load_json(ARTWORKS_JSON)
    if not artworks: return
    list_artworks()
    n = ask_choice(f'\n  选择编号 (1-{len(artworks)})：', len(artworks))
    if n is None: return
    item = artworks[n - 1]
    item['title'] = prompt('标题', item.get('title', ''))
    item['date'] = prompt('日期', item.get('date', ''))
    save_json(ARTWORKS_JSON, artworks)
    print('  ✓ 已保存（记得同步）')

# ★ 修改：支持批量删除画作
def delete_artwork():
    artworks = load_json(ARTWORKS_JSON)
    if not artworks: return
    list_artworks()
    
    print('\n  提示：支持输入 1,3,5 或 1-5 或 all 进行批量删除')
    raw = prompt('选择要删除的编号（回车取消）')
    if not raw: return
    
    indexes = parse_multi_choice(raw, len(artworks))
    if not indexes: return print('  未选择有效编号，已取消')
    
    print(f'\n  即将删除以下 {len(indexes)} 张画作：')
    for idx in reversed(indexes):
        print(f'    - {artworks[idx-1].get("title", "未命名")}')
        
    if prompt('  确认删除？(y/N)', 'N').lower() != 'y': return
    
    # 倒序删除，防止索引塌陷
    for idx in indexes:
        artworks.pop(idx - 1)
        
    save_json(ARTWORKS_JSON, artworks)
    print(f'  ✓ 已移除 {len(indexes)} 张画作（记得同步）')

def cmd_sync():
    sync_all()
    print('  ✓ 已重新生成 JS 数据与 HTML 页面')

def cmd_sync_menu():
    if input('\n  确认同步？(y/N)：').strip().lower() not in ('y', 'yes'): return
    print('  ' + '─' * 42)
    try: subprocess.run([sys.executable, str(ROOT / 'manage.py'), 'sync'], cwd=str(ROOT))
    except KeyboardInterrupt: print('\n  已中断')
    print('  ' + '─' * 42)

def cmd_list():
    list_articles()
    list_artworks()

MENU_ITEMS = [
    ('1', '添加文章', add_article), ('2', '添加画作', add_artwork),
    ('3', '查看文章列表', list_articles), ('4', '查看画作列表', list_artworks),
    ('5', '编辑文章', edit_article), ('6', '编辑画作', edit_artwork),
    ('7', '删除文章', delete_article), ('8', '删除画作', delete_artwork),
    ('9', '同步数据', cmd_sync_menu), ('m', '迁移旧结构', migrate_to_folders),
]

def run_menu():
    while True:
        print('\n' + '=' * 44 + '\n  胖宝基地 · 内容管理\n' + '=' * 44)
        for key, label, _ in MENU_ITEMS: print(f'  {key}. {label}')
        print('  0. 退出\n' + '=' * 44)
        
        try: choice = input('  请选择：').strip()
        except (EOFError, KeyboardInterrupt): return print('\n  拜拜 👋')
            
        if choice == '0': return print('  拜拜 👋')
        
        action = next((a for k, _, a in MENU_ITEMS if k == choice.lower()), None)
        if action:
            try: action()
            except KeyboardInterrupt: print('\n  已取消当前操作')
            except Exception as e: print(f'\n  [错误] {e}')
            pause()
        else: print('  无效选项')

CLI_COMMANDS = {'sync': cmd_sync, 's': cmd_sync, 'list': cmd_list, 'ls': cmd_list, 'menu': run_menu}

def main():
    ensure_dirs()
    auto_migrate_json()
    if len(sys.argv) > 1:
        cmd = sys.argv[1].lower()
        if cmd in ('-h', '--help', 'help'): return print(__doc__)
        action = CLI_COMMANDS.get(cmd)
        if action: return action()
        return print(f'  未知命令：{cmd}')
    run_menu()

if __name__ == '__main__':
    try: main()
    except KeyboardInterrupt:
        print('\n  强制退出，拜拜 👋')
        sys.exit(0)