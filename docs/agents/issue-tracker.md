# Issue tracker: GitHub

规格和任务发布到 cjx-bc/kitten-focus 的 GitHub Issues。
使用 gh，所有操作显式指定仓库：issue 和 label 命令使用 -R cjx-bc/kitten-focus；repo view 使用位置参数 cjx-bc/kitten-focus。

## Conventions

- 发布规格或任务：创建 GitHub issue。
- 多行正文保存为 UTF-8 文件，通过 --body-file 传入。
- 创建前查询已有 issue，避免重复发布。
- 创建：gh issue create -R cjx-bc/kitten-focus --title <title> --body-file <file> --label <label>
- 读取：gh issue view <number> -R cjx-bc/kitten-focus --json number,title,body,labels,comments
- 列表：gh issue list -R cjx-bc/kitten-focus --state open --json number,title,labels
- 标签名称按 docs/agents/triage-labels.md 映射。
- 子任务和阻塞关系优先使用 GitHub 原生关系。
- 修改后重新读取，核对目标、正文、标签和状态。
- 发布完成后报告 issue 链接。

## Pull requests as a triage surface

PRs as a request surface: no.
