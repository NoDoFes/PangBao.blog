#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
胖宝基地 · 内容管理脚本
================================================
交互式菜单：
    python3 manage.py            # 打开菜单
    python3 manage.py menu       # 同上

命令行模式（不依赖 input，永远可靠）：
    python3 manage.py sync       # 同步数据（重新生成 articles.js / artworks.js）
    python3 manage.py list       # 查看所有文章和画作
    python3 manage.py help       # 显示帮助

目录约定：
    essays/
      ├── articles.json
      ├── 2026-10-11/
      │   ├── 2026-10-11.md
      │   ├── sketch.jpg
      │   └── color.jpg
      └── 2026-09-28/
          ├── 2026-09-28.md
          └── screenshot.png
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

def _in_vscode():
    """检测是否运行在 VS Code 集成终端"""
    if os.environ.get('TERM_PROGRAM') == 'vscode':
        return True
    return any(k.startswith('VSCODE_') for k in os.environ)


# 在真正的 TTY 上启用 readline（修复中文输入退格）
# VS Code 集成终端下跳过，避免 readline 吞掉回车
if sys.stdin.isatty() and not _in_vscode():
    try:
        import readline  # noqa: F401
    except ImportError:
        pass

# Windows 中文输入输出修复
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
    if default is None:
        default = []
    if not path.exists():
        return list(default)
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


def sync_all():
    """把 JSON 数据同步到前端 JS"""
    articles = load_json(ARTICLES_JSON)
    artworks = load_json(ARTWORKS_JSON)
    _write_js(ARTICLES_JS, 'articles', articles)
    _write_js(ARTWORKS_JS, 'artworks', artworks)


def today():
    return date.today().isoformat()


def prompt(msg, default=''):
    label = f'{msg} [{default}]：' if default else f'{msg}：'
    val = input(label).strip()
    return val if val else default


def ask_choice(msg, max_n, allow_cancel=True):
    while True:
        raw = input(msg).strip()
        if allow_cancel and raw == '':
            return None
        if raw.isdigit():
            n = int(raw)
            if 1 <= n <= max_n:
                return n
        print(f'  请输入 1 ~ {max_n} 之间的数字' + ('，回车取消' if allow_cancel else ''))


def pause(msg='按回车返回菜单…'):
    """暂停，等用户按回车"""
    try:
        input(f'\n  {msg}')
    except (EOFError, KeyboardInterrupt):
        print()


def list_art_images():
    if not ART_DIR.exists():
        return []
    return sorted(
        p for p in ART_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    )


def is_new_structure(md_rel):
    try:
        p = (ROOT / md_rel).resolve()
        return (
            p.suffix.lower() == '.md' and
            p.parent.parent.resolve() == ESSAYS_DIR.resolve()
        )
    except Exception:
        return False


def auto_migrate_json():
    if not ARTICLES_JSON.exists() and ARTICLES_JS.exists():
        _try_migrate(ARTICLES_JS, ARTICLES_JSON, 'articles')
    if not ARTWORKS_JSON.exists() and ARTWORKS_JS.exists():
        _try_migrate(ARTWORKS_JS, ARTWORKS_JSON, 'artworks')


def _try_migrate(js_path, json_path, varname):
    try:
        text = js_path.read_text(encoding='utf-8')
        m = re.search(rf'PB\.{varname}\s*=\s*(\[[\s\S]*?\])\s*;', text)
        if not m:
            return
        js = m.group(1)
        js = re.sub(r'([{,]\s*)([A-Za-z_][\w-]*)\s*:', r'\1"\2":', js)
        js = re.sub(r"'((?:[^'\\]|\\.)*)'", lambda mm: json.dumps(mm.group(1)), js)
        data = json.loads(js)
        save_json(json_path, data)
        print(f'  ✓ 已从 {js_path.name} 迁移 {len(data)} 条 → {json_path.relative_to(ROOT)}')
    except Exception as e:
        print(f'  [提示] 未能自动迁移 {js_path.name}（{e}）')


# ============================================================
# 文章操作
# ============================================================
def add_article():
    print('\n--- 添加文章 ---')
    articles = load_json(ARTICLES_JSON)

    title = prompt('标题')
    if not title:
        print('  取消：标题不能为空')
        return

    d = prompt('日期 (YYYY-MM-DD)', today())
    folder = prompt('文件夹名', d)

    while (ESSAYS_DIR / folder / f'{folder}.md').exists():
        print(f'  ⚠ essays/{folder}/{folder}.md 已存在')
        folder = prompt('换一个文件夹名', folder + '-2')

    post_dir = ESSAYS_DIR / folder
    post_md  = post_dir / f'{folder}.md'

    desc = prompt('简介（可留空）')

    post_dir.mkdir(parents=True, exist_ok=True)

    if not post_md.exists():
        tpl = (
            f'---\n'
            f'title: {title}\n'
            f'date: {d}\n'
            f'---\n\n'
            f'# {title}\n\n'
            f'<!-- 把图片放进 essays/{folder}/，md 里用 ![](图片名.jpg) 引用 -->\n\n'
            f'（在这里写正文…）\n'
        )
        post_md.write_text(tpl, encoding='utf-8')
        print(f'  ✓ 已创建文章：essays/{folder}/{folder}.md')
        print(f'  💡 把图片放进 essays/{folder}/，md 里用 ![](图片名.jpg) 引用')
    else:
        print(f'  ℹ 已存在：essays/{folder}/{folder}.md')

    item = {'title': title, 'date': d, 'md': f'essays/{folder}/{folder}.md'}
    if desc:
        item['desc'] = desc

    articles.insert(0, item)
    save_json(ARTICLES_JSON, articles)
    print('  ✓ 文章已添加（数据源已更新，记得同步）')


def list_articles():
    articles = load_json(ARTICLES_JSON)
    print(f'\n--- 文章列表（共 {len(articles)} 篇）---')
    if not articles:
        print('  （空）')
        return
    for i, a in enumerate(articles, 1):
        d = a.get('date', '----------')
        print(f'  {i:>2}. [{d}] {a.get("title", "未命名")}')
        print(f'      → {a.get("md", "?")}')


def edit_article():
    articles = load_json(ARTICLES_JSON)
    if not articles:
        print('\n  没有文章可编辑')
        return
    list_articles()
    print()
    n = ask_choice(f'  选择要编辑的文章编号 (1-{len(articles)})：', len(articles))
    if n is None:
        return

    item = articles[n - 1]
    print(f'\n--- 编辑：{item.get("title")} ---')
    print('  （直接回车保持原值）\n')

    new_title = prompt('标题', item.get('title', ''))
    new_date  = prompt('日期',   item.get('date', ''))
    new_md    = prompt('md 路径', item.get('md', ''))
    new_desc  = prompt('简介',   item.get('desc', ''))

    item['title'] = new_title
    item['date']  = new_date
    item['md']    = new_md
    if new_desc:
        item['desc'] = new_desc
    elif 'desc' in item:
        del item['desc']

    articles[n - 1] = item
    save_json(ARTICLES_JSON, articles)
    print('  ✓ 已保存（数据源已更新，记得同步）')


def delete_article():
    articles = load_json(ARTICLES_JSON)
    if not articles:
        print('\n  没有文章可删除')
        return
    list_articles()
    print()
    n = ask_choice(f'  选择要删除的文章编号 (1-{len(articles)})：', len(articles))
    if n is None:
        return

    item = articles[n - 1]
    if prompt(f'  确认删除「{item.get("title")}」？(y/N)', 'N').lower() != 'y':
        print('  已取消')
        return

    articles.pop(n - 1)
    save_json(ARTICLES_JSON, articles)

    md = item.get('md', '')
    if md:
        md_path  = ROOT / md
        post_dir = md_path.parent
        try:
            under_essays = (
                post_dir.resolve() != ESSAYS_DIR.resolve() and
                post_dir.resolve().parent == ESSAYS_DIR.resolve()
            )
        except Exception:
            under_essays = False

        if under_essays and post_dir.exists() and post_dir.is_dir():
            folder_name = post_dir.name
            if prompt(f'  是否删除整个文件夹 essays/{folder_name}/ ？(y/N)', 'N').lower() == 'y':
                shutil.rmtree(post_dir)
                print(f'  ✓ 已删除文件夹：essays/{folder_name}/')
        else:
            if md_path.exists() and md_path.is_file():
                if prompt(f'  是否删除 md 文件 {md} ？(y/N)', 'N').lower() == 'y':
                    md_path.unlink()
                    print(f'  ✓ 已删除：{md}')

    print('  ✓ 已从列表中移除（数据源已更新，记得同步）')


# ============================================================
# 迁移：旧结构 → 文件夹结构
# ============================================================
def migrate_to_folders():
    print('\n--- 迁移为文件夹结构 ---')
    print('  essays/2026-10-11.md  →  essays/2026-10-11/2026-10-11.md\n')

    articles = load_json(ARTICLES_JSON)
    if not articles:
        print('  没有文章需要迁移')
        return

    migrated = 0
    new_articles = []

    for item in articles:
        old_md = item.get('md', '')
        if not old_md or is_new_structure(old_md):
            if old_md:
                print(f'  · 已是新结构：{old_md}')
            new_articles.append(item)
            continue

        md_path = ROOT / old_md
        try:
            if md_path.parent.resolve() != ESSAYS_DIR.resolve():
                print(f'  ! 跳过（不在 essays/ 顶层）：{old_md}')
                new_articles.append(item)
                continue
        except Exception:
            new_articles.append(item)
            continue

        if not md_path.exists() or not md_path.is_file():
            print(f'  ! 跳过（文件不存在）：{old_md}')
            new_articles.append(item)
            continue

        stem    = md_path.stem
        new_dir = ESSAYS_DIR / stem
        new_md  = new_dir / f'{stem}.md'

        if new_md.exists():
            print(f'  ! 跳过（目标已存在）：essays/{stem}/{stem}.md')
            new_articles.append(item)
            continue

        new_dir.mkdir(parents=True, exist_ok=True)
        try:
            shutil.move(str(md_path), str(new_md))
        except Exception as e:
            print(f'  ! 移动失败：{old_md} → {e}')
            new_articles.append(item)
            continue

        print(f'  ✓ {old_md}  →  essays/{stem}/{stem}.md')
        new_item = dict(item)
        new_item['md'] = f'essays/{stem}/{stem}.md'
        new_articles.append(new_item)
        migrated += 1

    if migrated > 0:
        save_json(ARTICLES_JSON, new_articles)
        print(f'\n  ✓ 共迁移 {migrated} 篇（数据源已更新，记得同步）')
    else:
        print('\n  没有需要迁移的内容')


# ============================================================
# 画作操作
# ============================================================
def pick_image():
    imgs = list_art_images()

    if imgs:
        print(f'\n  arts/ 里发现 {len(imgs)} 张图：\n')
        for i, p in enumerate(imgs, 1):
            print(f'    {i:>3}. {p.name}')
        print('\n  输入编号选择，或直接输入文件名 / 相对路径')
        raw = input('  > ').strip()
        if not raw:
            return None
        if raw.isdigit():
            idx = int(raw)
            if 1 <= idx <= len(imgs):
                return f'arts/{imgs[idx - 1].name}'
            print('  编号超范围')
            return None
        if raw.startswith(('arts/', '/', 'http://', 'https://', 'data:')):
            return raw
        if (ART_DIR / raw).exists():
            return f'arts/{raw}'
        return raw
    else:
        print('\n  arts/ 目录是空的，请把图片放进去后再来。')
        print('  或直接输入一个路径（如 arts/xxx.jpg）')
        raw = input('  > ').strip()
        return raw if raw else None


def add_artwork():
    print('\n--- 添加画作 ---')
    artworks = load_json(ARTWORKS_JSON)

    src = pick_image()
    if not src:
        print('  取消')
        return

    if not src.startswith(('http://', 'https://', '/', 'data:')):
        if not (ROOT / src).exists():
            print(f'  [警告] 文件不存在：{src}')
            if prompt('  仍要添加？(y/N)', 'N').lower() != 'y':
                print('  已取消')
                return

    stem = Path(src).stem
    stem = re.sub(r'^\d{4}-\d{2}-\d{2}[-_]?', '', stem)
    default_title = stem or '未命名'

    title    = prompt('标题', default_title)
    d        = prompt('日期 (YYYY-MM-DD)', today())
    tags_raw = prompt('标签（逗号分隔，可留空）')
    tags     = [t.strip() for t in tags_raw.replace('，', ',').split(',') if t.strip()]

    item = {'src': src}
    if title: item['title'] = title
    if d:     item['date']  = d
    if tags:  item['tags']  = tags

    artworks.insert(0, item)
    save_json(ARTWORKS_JSON, artworks)
    print('  ✓ 画作已添加（数据源已更新，记得同步）')


def list_artworks():
    artworks = load_json(ARTWORKS_JSON)
    print(f'\n--- 画作列表（共 {len(artworks)} 张）---')
    if not artworks:
        print('  （空）')
        return
    for i, a in enumerate(artworks, 1):
        d    = a.get('date', '----------')
        tags = ' ' + ','.join('#' + t for t in a.get('tags', [])) if a.get('tags') else ''
        print(f'  {i:>2}. [{d}] {a.get("title", "未命名")}{tags}')
        print(f'      → {a.get("src", "?")}')


def edit_artwork():
    artworks = load_json(ARTWORKS_JSON)
    if not artworks:
        print('\n  没有画作可编辑')
        return
    list_artworks()
    print()
    n = ask_choice(f'  选择要编辑的画作编号 (1-{len(artworks)})：', len(artworks))
    if n is None:
        return

    item = artworks[n - 1]
    print(f'\n--- 编辑：{item.get("title")} ---')
    print('  （直接回车保持原值）\n')

    new_title = prompt('标题', item.get('title', ''))
    new_date  = prompt('日期', item.get('date', ''))
    new_tags  = prompt('标签（逗号分隔，输入 - 清空）', ','.join(item.get('tags', [])))

    if new_title:
        item['title'] = new_title
    if new_date:
        item['date'] = new_date

    if new_tags == '-':
        item.pop('tags', None)
    else:
        tags = [t.strip() for t in new_tags.replace('，', ',').split(',') if t.strip()]
        if tags:
            item['tags'] = tags
        else:
            item.pop('tags', None)

    artworks[n - 1] = item
    save_json(ARTWORKS_JSON, artworks)
    print('  ✓ 已保存（数据源已更新，记得同步）')


def delete_artwork():
    artworks = load_json(ARTWORKS_JSON)
    if not artworks:
        print('\n  没有画作可删除')
        return
    list_artworks()
    print()
    n = ask_choice(f'  选择要删除的画作编号 (1-{len(artworks)})：', len(artworks))
    if n is None:
        return

    item = artworks[n - 1]
    if prompt(f'  确认删除「{item.get("title")}」？(y/N)', 'N').lower() != 'y':
        print('  已取消')
        return

    artworks.pop(n - 1)
    save_json(ARTWORKS_JSON, artworks)
    print('  ✓ 已删除（图片文件保留在 arts/ 中，记得同步）')


# ============================================================
# 命令实现
# ============================================================
def cmd_sync():
    """CLI 命令：直接同步，无确认"""
    sync_all()
    print('  ✓ 已重新生成 articles.js 和 artworks.js')


def cmd_sync_menu():
    """菜单命令：先确认，再通过子进程调用 python3 manage.py sync（输出可见）"""
    print()
    ans = input('  确认同步数据？(y/N)：').strip().lower()
    if ans not in ('y', 'yes'):
        print('  已取消')
        return

    script = str(ROOT / 'manage.py')
    print()
    print('  $ python3 manage.py sync')
    print('  ' + '─' * 42)

    try:
        result = subprocess.run(
            [sys.executable, script, 'sync'],
            cwd=str(ROOT),
        )
    except KeyboardInterrupt:
        print('\n  已中断')
        return

    print('  ' + '─' * 42)
    if result.returncode == 0:
        print('  ✓ 同步完成')
    else:
        print(f'  ✗ 同步失败（退出码 {result.returncode}）')


def cmd_list():
    """列出所有文章和画作"""
    list_articles()
    list_artworks()


# ============================================================
# 交互式菜单
# ============================================================
MENU_ITEMS = [
    ('1', '添加文章',      add_article),
    ('2', '添加画作',      add_artwork),
    ('3', '查看文章列表',  list_articles),
    ('4', '查看画作列表',  list_artworks),
    ('5', '编辑文章',      edit_article),
    ('6', '编辑画作',      edit_artwork),
    ('7', '删除文章',      delete_article),
    ('8', '删除画作',      delete_artwork),
    ('9', '同步数据',      cmd_sync_menu),
    ('m', '迁移旧结构',    migrate_to_folders),
]


# 哪些操作执行完后自动 pause（等用户按回车再回菜单）
# 说明：'9' 已经在 cmd_sync_menu 里展示过输出，也可以 pause；
#       这里统一对所有操作 pause，用户体验最一致
PAUSE_AFTER = True


def run_menu():
    while True:
        print()
        print('=' * 44)
        print('  胖宝基地 · 内容管理')
        print('=' * 44)
        for key, label, _ in MENU_ITEMS:
            print(f'  {key}. {label}')
        print('  0. 退出')
        print('=' * 44)

        try:
            choice = input('  请选择：').strip()
        except (EOFError, KeyboardInterrupt):
            print('\n  拜拜 👋')
            return

        if choice == '0':
            print('  拜拜 👋')
            return

        key = choice.lower() if choice.lower() == 'm' else choice
        action = next((a for k, _, a in MENU_ITEMS if k == key), None)
        if action is None:
            print('  无效选项')
            continue

        try:
            action()
        except KeyboardInterrupt:
            print('\n  已取消当前操作')
        except Exception as e:
            print(f'  [错误] {e}')

        if PAUSE_AFTER:
            pause()


# ============================================================
# CLI 命令表
# ============================================================
CLI_COMMANDS = {
    'sync': cmd_sync,
    's':    cmd_sync,
    'list': cmd_list,
    'ls':   cmd_list,
    'menu': run_menu,
}


def print_help():
    print(__doc__)
    print('=' * 44)
    print('  可用命令：')
    print('    sync / s      同步数据（重新生成 JS）')
    print('    list / ls     查看所有文章和画作')
    print('    menu          打开交互式菜单')
    print('    help / -h     显示本帮助')
    print('=' * 44)


# ============================================================
# 主入口
# ============================================================
def main():
    ensure_dirs()
    auto_migrate_json()

    if len(sys.argv) > 1:
        cmd = sys.argv[1].lower()
        if cmd in ('-h', '--help', 'help'):
            print_help()
            return
        action = CLI_COMMANDS.get(cmd)
        if action is None:
            print(f'  未知命令：{cmd}\n')
            print_help()
            return
        action()
        return

    run_menu()


if __name__ == '__main__':
    main()