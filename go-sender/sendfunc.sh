#!/bin/bash
function send_file {
  local target=$1
  local cmd=$2

  # 通过pwd获取文件夹名称
  local dir=$(pwd | awk -F/ '{print $NF}')

  if which sender >/dev/null 2>&1; then
      # 没问题，执行命令
  else
      echo "Command sender does not exist, sender不存在，请编译后使用，并添加到环境变量中"
      return -1
  fi
  # 交互式确认是否需要将文件推送到设备
  if [ -z "$target" ]; then
    echo "请输入需要推送的文件"
    read target
  fi

  if test $? -eq -1 ; then
    return -1
  fi
  echo "是否将 $target 推送到 sdcard/脚本/$dir/$target ? (y/n)"
  read yesOrNo
  if [ "$yesOrNo" != "y" ]; then
    return -1
  fi

  sender -file=$target -save=/sdcard/脚本/$dir/$target
}
