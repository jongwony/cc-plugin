# caffeinate-plugin

macOS sleep prevention toggle for Claude Code.

- `caffeinate -ims`: idle, disk, system sleep 방지 (display sleep은 배터리 절약을 위해 허용)
- `pmset disablesleep`: clamshell 모드에서도 sleep 방지
- 자동 종료: 배터리 30% 미만 또는 네트워크 연결 끊김

## Setup (one-time)

`smart-caffeinate.sh`가 `sudo -n pmset`을 사용하므로, passwordless sudo 설정이 필요합니다:

```bash
echo "$(whoami) ALL=(root) NOPASSWD: /usr/bin/pmset" | sudo tee /etc/sudoers.d/pmset
```

검증:

```bash
sudo -n pmset -g  # 패스워드 프롬프트 없이 실행되면 성공
```
