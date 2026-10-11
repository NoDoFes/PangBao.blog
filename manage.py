#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
胖宝基地 · 内容管理脚本
用法：python manage.py

目录约定：
  essays/
    ├── articles.json
    ├── 2026-10-11/
    │   ├── 2026-10-11.md     ← 文章正文（与文件夹同名）
    │   ├── sketch.jpg         ← 配图
    │   └── color.jpg
    └── 2026-09-28/
        ├── 2026-09-28.md
        └── screenshot.png
"""
import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path

# Windows 中文输入输出修复
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stdin.reconfigure(encoding='utf-8')
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent

# 目录
ART_DIR = ROOT / 'arts'          # 画作
ESSAYS_DIR = ROOT / 'essays'     # 文章及其配图

# 数据文件
ARTICLES_JSON = ESSAYS_DIR / 'articles.json'
ARTWORKS_JSON = ART_DIR / 'artworks.json'

# 前端读取的生成产物
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


def write_articles_js(articles):
    header = (
        '// ============================================\n'
        '// 文章清单 —— 由 manage.py 自动生成\n'
        '// 要添加 / 修改文章，请运行 manage.py\n'
        '// ============================================\n'
        'window.PB = window.PB || {};\n\n'
        'PB.articles = '
    )
    body = json.dumps(articles, ensure_ascii=False, indent=2)
    with ARTICLES_JS.open('w', encoding='utf-8') as f:
        f.write(header + body + ';\n')


def write_artworks_js(artworks):
    header = (
        '// ============================================\n'
        '// 画作清单 —— 由 manage.py 自动生成\n'
        '// 要添加 / 修改画作，请运行 manage.py\n'
        '// ============================================\n'
        'window.PB = window.PB || {};\n\n'
        'PB.artworks = '
    )
    body = json.dumps(artworks, ensure_ascii=False, indent=2)
    with ARTWORKS_JS.open('w', encoding='utf-8') as f:
        f.write(header + body + ';\n')


def sync_all():
    articles = load_json(ARTICLES_JSON)
    artworks = load_json(ARTWORKS_JSON)
    write_articles_js(articles)
    write_artworks_js(artworks)


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


def list_art_images():
    if not ART_DIR.exists():
        return []
    return sorted(
        p for p in ART_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    )


def is_new_structure(md_rel):
    """判断 md 路径是否是 essays/子文件夹/xxx.md 结构"""
    try:
        p = (ROOT / md_rel).resolve()
        return (
            p.suffix.lower() == '.md' and
            p.parent.parent.resolve() == ESSAYS_DIR.resolve()
        )
    except Exception:
        return False


def auto_migrate_json():
    """首次运行：如果 JSON 不存在但 .js 里有数据，尝试迁移"""
    if not ARTICLES_JSON.exists() and ARTICLES_JS.exists():
        try:
            text = ARTICLES_JS.read_text(encoding='utf-8')
            m = re.search(r'PB\.articles\s*=\s*(\[[\s\S]*?\])\s*;', text)
            if m:
                js = m.group(1)
                js = re.sub(r'([{,]\s*)([A-Za-z_][\w-]*)\s*:', r'\1"\2":', js)
                js = re.sub(r"'((?:[^'\\]|\\.)*)'", lambda mm: json.dumps(mm.group(1)), js)
                data = json.loads(js)
                save_json(ARTICLES_JSON, data)
                print(f'  ✓ 已从 articles.js 迁移 {len(data)} 条文章 → essays/articles.json')
        except Exception as e:
            print(f'  [提示] 未能自动迁移 articles.js（{e}）')

    if not ARTWORKS_JSON.exists() and ARTWORKS_JS.exists():
        try:
            text = ARTWORKS_JS.read_text(encoding='utf-8')
            m = re.search(r'PB\.artworks\s*=\s*(\[[\s\S]*?\])\s*;', text)
            if m:
                js = m.group(1)
                js = re.sub(r'([{,]\s*)([A-Za-z_][\w-]*)\s*:', r'\1"\2":', js)
                js = re.sub(r"'((?:[^'\\]|\\.)*)'", lambda mm: json.dumps(mm.group(1)), js)
                data = json.loads(js)
                save_json(ARTWORKS_JSON, data)
                print(f'  ✓ 已从 artworks.js 迁移 {len(data)} 条画作 → arts/artworks.json')
        except Exception as e:
            print(f'  [提示] 未能自动迁移 artworks.js（{e}）')


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

    # 若文件夹已存在且已有同名 md，提示换名
    while (ESSAYS_DIR / folder / f'{folder}.md').exists():
        print(f'  ⚠ essays/{folder}/{folder}.md 已存在')
        folder = prompt('换一个文件夹名', folder + '-2')

    post_dir = ESSAYS_DIR / folder
    post_md = post_dir / f'{folder}.md'

    desc = prompt('简介（可留空）')

    # 建目录
    post_dir.mkdir(parents=True, exist_ok=True)

    # 建 md（仅当不存在）
    if not post_md.exists():
        tpl = (
            f'---\n'
            f'title: {title}\n'
            f'date: {d}\n'
            f'---\n\n'
            f'# {title}\n\n'
            f'<!-- 把图片放进这个文件夹（essays/{folder}/），然后在正文里这样引用：\n'
            f'     ![说明](图片名.jpg)\n'
            f'     正文的第一张图会自动成为首页封面。 -->\n\n'
            f'（在这里写正文…）\n'
        )
        post_md.write_text(tpl, encoding='utf-8')
        print(f'  ✓ 已创建文章：essays/{folder}/{folder}.md')
        print(f'  ✓ 已创建文件夹：essays/{folder}/')
        print(f'  💡 把图片放进 essays/{folder}/，md 里用 ![](图片名.jpg) 引用')
    else:
        print(f'  ℹ 已存在：essays/{folder}/{folder}.md')

    item = {'title': title, 'date': d, 'md': f'essays/{folder}/{folder}.md'}
    if desc:
        item['desc'] = desc

    articles.insert(0, item)
    save_json(ARTICLES_JSON, articles)
    write_articles_js(articles)
    print('  ✓ 文章已添加')


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
    new_date = prompt('日期', item.get('date', ''))
    new_md = prompt('md 路径', item.get('md', ''))
    new_desc = prompt('简介', item.get('desc', ''))

    item['title'] = new_title
    item['date'] = new_date
    item['md'] = new_md
    if new_desc:
        item['desc'] = new_desc
    elif 'desc' in item:
        del item['desc']

    articles[n - 1] = item
    save_json(ARTICLES_JSON, articles)
    write_articles_js(articles)
    print('  ✓ 已保存')


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
    confirm = prompt(f'  确认删除「{item.get("title")}」？(y/N)', 'N')
    if confirm.lower() != 'y':
        print('  已取消')
        return

    articles.pop(n - 1)
    save_json(ARTICLES_JSON, articles)
    write_articles_js(articles)

    md = item.get('md', '')
    if md:
        md_path = ROOT / md

        # 新结构：整个文件夹一起删
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
            # 旧结构兜底
            if md_path.exists() and md_path.is_file():
                if prompt(f'  是否删除 md 文件 {md} ？(y/N)', 'N').lower() == 'y':
                    md_path.unlink()
                    print(f'  ✓ 已删除：{md}')

    print('  ✓ 已从列表中移除')


# ============================================================
# 迁移：旧结构 → 文件夹结构
# ============================================================
def migrate_to_folders():
    print('\n--- 迁移为文件夹结构 ---')
    print('  essays/2026-10-11.md  →  essays/2026-10-11/2026-10-11.md')
    print()

    articles = load_json(ARTICLES_JSON)
    if not articles:
        print('  没有文章需要迁移')
        return

    migrated = 0
    new_articles = []

    for item in articles:
        old_md = item.get('md', '')
        if not old_md:
            new_articles.append(item)
            continue

        # 已是新结构，跳过
        if is_new_structure(old_md):
            print(f'  · 已是新结构：{old_md}')
            new_articles.append(item)
            continue

        md_path = ROOT / old_md

        # 必须在 essays/ 顶层
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

        # essays/2026-10-11.md → essays/2026-10-11/2026-10-11.md
        stem = md_path.stem
        new_dir = ESSAYS_DIR / stem
        new_md = new_dir / f'{stem}.md'

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
        write_articles_js(new_articles)
        print(f'\n  ✓ 共迁移 {migrated} 篇')
        print('  💡 现在 md 里的图片可以简化为：![](图片名.jpg)')
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

    title = prompt('标题', default_title)
    d = prompt('日期 (YYYY-MM-DD)', today())
    tags_raw = prompt('标签（逗号分隔，可留空）')
    tags = [t.strip() for t in tags_raw.replace('，', ',').split(',') if t.strip()]

    item = {'src': src}
    if title: item['title'] = title
    if d:     item['date'] = d
    if tags:  item['tags'] = tags

    artworks.insert(0, item)
    save_json(ARTWORKS_JSON, artworks)
    write_artworks_js(artworks)
    print('  ✓ 画作已添加（date 最新的会自动出现在首页）')


def list_artworks():
    artworks = load_json(ARTWORKS_JSON)
    print(f'\n--- 画作列表（共 {len(artworks)} 张）---')
    if not artworks:
        print('  （空）')
        return
    for i, a in enumerate(artworks, 1):
        d = a.get('date', '----------')
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
    new_date  = prompt('日期',   item.get('date', ''))
    new_tags  = prompt('标签（逗号分隔，输入 - 清空）',
                       ','.join(item.get('tags', [])))

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
    write_artworks_js(artworks)
    print('  ✓ 已保存')


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
    write_artworks_js(artworks)
    print('  ✓ 已删除（图片文件保留在 arts/ 中）')


# ============================================================
# 主菜单
# ============================================================
def main():
    ensure_dirs()
    auto_migrate_json()

    while True:
        print()
        print('=' * 44)
        print('  胖宝基地 · 内容管理')
        print('=' * 44)
        print('  1. 添加文章')
        print('  2. 添加画作')
        print('  3. 查看文章列表')
        print('  4. 查看画作列表')
        print('  5. 编辑文章')
        print('  6. 编辑画作')
        print('  7. 删除文章')
        print('  8. 删除画作')
        print('  9. 重新生成 JS（修复用）')
        print('  M. 迁移旧结构（.md → 文件夹/日期.md）')
        print('  0. 退出')
        print('=' * 44)
        choice = input('  请选择：').strip()

        try:
            if   choice == '1': add_article()
            elif choice == '2': add_artwork()
            elif choice == '3': list_articles()
            elif choice == '4': list_artworks()
            elif choice == '5': edit_article()
            elif choice == '6': edit_artwork()
            elif choice == '7': delete_article()
            elif choice == '8': delete_artwork()
            elif choice == '9':
                sync_all()
                print('  ✓ 已重新生成 articles.js 和 artworks.js')
            elif choice.lower() == 'm':
                migrate_to_folders()
            elif choice == '0':
                print('  拜拜 👋')
                break
            else:
                print('  无效选项')
        except KeyboardInterrupt:
            print('\n  已取消当前操作')
            continue
        except Exception as e:
            print(f'  [错误] {e}')


if __name__ == '__main__':
    main()