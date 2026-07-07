"""一键运行：采集 + 导出"""
import sys
import argparse
from scrape import scrape
from export import export


def main():
    parser = argparse.ArgumentParser(description="招投标数据采集 + 导出")
    parser.add_argument("--skip-scrape", action="store_true", help="跳过采集，仅导出")
    parser.add_argument("--skip-export", action="store_true", help="跳过导出，仅采集")
    args = parser.parse_args()

    if not args.skip_scrape:
        print("=" * 60)
        print("步骤 1/2: 数据采集")
        print("=" * 60)
        try:
            scrape()
        except Exception as e:
            print(f"采集失败: {e}")
            if not args.skip_export:
                print("跳过导出。")
            sys.exit(1)

    if not args.skip_export:
        print("\n" + "=" * 60)
        print("步骤 2/2: 数据导出")
        print("=" * 60)
        try:
            export()
        except Exception as e:
            print(f"导出失败: {e}")
            sys.exit(1)

    print("\n全部完成!")


if __name__ == "__main__":
    main()
