package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/google/uuid" // 新增UUID包
	"github.com/gorilla/websocket"
)

// FileMeta 文件元数据
type FileMeta struct {
	Type     string `json:"type"`
	FileName string `json:"fileName"`
	SavePath string `json:"savePath"`
	FileSize int64  `json:"fileSize"`
	FileExt  string `json:"fileExt"`
	UploadId string `json:"uploadId"`
}

// PullFileMeta 拉取文件元数据
type PullFileMeta struct {
	Type     string `json:"type"`
	FilePath string `json:"filePath"`
}

// ListFileMeta 读取文件列表元数据
type ListFileMeta struct {
	Type string `json:"type"`
	Path string `json:"path"`
}

type ListFileResp struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Files   []struct {
		Path  string `json:"path"`
		IsDir bool   `json:"isDir"`
	} `json:"files"`
}

func fatal(v ...interface{}) {
	// 红色ANSI转义码
	red := "\033[31m"
	reset := "\033[0m"

	// 临时输出红色，然后恢复默认
	log.SetOutput(&tempColorWriter{
		out:    os.Stderr,
		prefix: red,
		suffix: reset,
	})

	log.Fatal(v...)
}

func fatalf(format string, v ...interface{}) {
	// 红色ANSI转义码
	red := "\033[31m"
	reset := "\033[0m"

	// 临时输出红色，然后恢复默认
	log.SetOutput(&tempColorWriter{
		out:    os.Stderr,
		prefix: red,
		suffix: reset,
	})

	log.Fatalf(format, v...)
}

type tempColorWriter struct {
	out    *os.File
	prefix string
	suffix string
}

func (w *tempColorWriter) Write(p []byte) (n int, err error) {
	w.out.Write([]byte(w.prefix))
	n, err = w.out.Write(p)
	w.out.Write([]byte(w.suffix))
	return
}

func getEnvOr(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

func main() {

	// 定义命令行参数变量
	var (
		filePath = flag.String("file", "default.txt", "文件路径，发送模式时是本机的文件路径，当拉取/列表模式时，为设备上的文件路径")
		savePath = flag.String("save", "/sdcard/脚本/测试用/", "保存路径，发送模式时是设备上的路径，当拉取模式时，为本机保存路径")
		host     = flag.String("host", getEnvOr("SEND_WS_HOST", "192.168.22.235:8212"), "服务地址，需要设备上开启websocket服务端 可配置环境变量 SEND_WS_HOST")
		pull     = flag.Bool("pull", false, "是否为拉取文件")
		list     = flag.Bool("list", false, "是否为列出文件列表。list和pull只能选择一个，list优先级更高")
	)
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage of %s:\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "  这是一个基于websocket的文件传输工具，可以用来在设备间传输文件\n\n")
		fmt.Fprintf(os.Stderr, "Options:\n")
		flag.PrintDefaults()
	}
	// 解析参数（必须调用）
	flag.Parse()
	fmt.Printf("拉取文件模式： %t\n", *pull)
	fmt.Printf("文件列表模式： %t\n", *list)
	fmt.Printf("服务地址: %s\n", *host)

	// 设置WebSocket服务器地址
	u := url.URL{Scheme: "ws", Host: *host, Path: "/"}
	log.Printf("Connecting to %s", u.String())

	// 建立WebSocket连接
	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		fatal("Dial error: ", err)
	}
	defer conn.Close()
	if *list {
		log.Printf("读取文件列表路径: %s", *filePath)
		listFile(conn, filePath)
		return
	}

	if *pull {
		// 使用参数
		fmt.Printf("拉取文件路径: %s\n", *filePath)
		fmt.Printf("保存路径: %s\n", *savePath)
		pullFile(conn, filePath, *savePath)
	} else {
		fileName := filepath.Base(*filePath)
		newSavePath := strings.Replace(*savePath, fileName, "", 1)
		// 使用参数
		fmt.Printf("文件路径: %s\n", *filePath)
		fmt.Printf("文件名称: %s\n", fileName)
		fmt.Printf("保存路径: %s\n", newSavePath)
		sendFile(conn, filePath, newSavePath, fileName)
	}

}

func pullFile(conn *websocket.Conn, filePath *string, savePath string) {

	// 准备元数据
	meta := PullFileMeta{
		Type:     "pullFile",
		FilePath: *filePath,
	}

	// 将元数据序列化为JSON
	metaJson, err := json.Marshal(meta)
	if err != nil {
		fatal("JSON marshal error:", err)
	}

	// 先发送元数据(作为文本消息)
	if err := conn.WriteMessage(websocket.TextMessage, metaJson); err != nil {
		fatal("Send metadata error:", err)
	}
	// 创建或打开一个文件用于写入二进制数据
	file, err := os.Create(savePath)
	if err != nil {
		fatalf("创建文件失败: %v", err)
	}
	defer file.Close()
	// 在发送元数据之后添加响应处理
	messageType, message, err := conn.ReadMessage()
	if err != nil {
		fatal("等待元数据响应失败:", err)
	}
	// 只处理二进制消息
	if messageType == websocket.BinaryMessage {
		// 将接收到的二进制数据写入文件
		_, err := file.Write(message)
		if err != nil {
			fatalf("写入文件失败: %v", err)
		}
		log.Printf("写入 %d 字节二进制数据到文件", len(message))
	} else {
		fatalf("收到非二进制消息，忽略 messageType: %d 响应数据：%s", messageType, message)
	}
	log.Print("Pull file successfully!")
}

func listFile(conn *websocket.Conn, filePath *string) {
	log.Printf("准备读取文件列表，路径：%s", *filePath)
	listFile := ListFileMeta{
		Type: "listFile",
		Path: *filePath,
	}
	// 将元数据序列化为JSON
	metaJson, err := json.Marshal(listFile)
	if err != nil {
		fatal("JSON marshal error:", err)
	}
	// 先发送元数据(作为文本消息)
	if err := conn.WriteMessage(websocket.TextMessage, metaJson); err != nil {
		fatal("Send metadata error:", err)
	}
	// 在发送元数据之后添加响应处理
	_, resp, err := conn.ReadMessage()
	if err != nil {
		fatal("等待元数据响应失败:", err)
	}
	// log.Printf("服务端元数据响应:")
	// prettyJson(resp)
	var listFileResp ListFileResp
	if err := json.Unmarshal(resp, &listFileResp); err != nil {
		fatal("解析响应数据失败", err)
	}
	if listFileResp.Code != "success" {
		fatalf("读取失败：%s", prettyJson(resp))
	}
	// 排序逻辑：
	// 1. 先按照 IsDir 排序，假设目录排在前面（即 IsDir==true 的排前面）
	// 2. 然后再按照文件或目录名称排序
	sort.Slice(listFileResp.Files, func(i, j int) bool {
		// 如果一个是目录，一个不是目录，则目录排前
		if listFileResp.Files[i].IsDir != listFileResp.Files[j].IsDir {
			return listFileResp.Files[i].IsDir && !listFileResp.Files[j].IsDir
		}
		// 如果两者类型相同，再按照文件名称进行字典序排序
		return listFileResp.Files[i].Path < listFileResp.Files[j].Path
	})
	for _, file := range listFileResp.Files {
		mark := "F"
		if file.IsDir {
			mark = "D"
		}
		fmt.Printf("%s\t%s\n", mark, file.Path)
	}
}

func sendFile(conn *websocket.Conn, filePath *string, savePath string, fileName string) {
	// 读取文件内容
	content, err := ioutil.ReadFile(*filePath)
	if err != nil {
		fatal("Read file error:", err)
	}

	// 获取文件信息
	fileInfo, err := os.Stat(*filePath)
	if err != nil {
		fatal("Get file info error:", err)
	}

	// 生成随机UUID（新增部分）
	uploadID := uuid.New().String()

	// 准备元数据
	meta := FileMeta{
		Type:     "file",
		FileName: filepath.Base(*filePath),
		SavePath: savePath,
		FileSize: fileInfo.Size(),
		FileExt:  filepath.Ext(*filePath),
		UploadId: uploadID, // 替换为随机UUID
	}

	// 将元数据序列化为JSON
	metaJson, err := json.Marshal(meta)
	if err != nil {
		fatal("JSON marshal error:", err)
	}

	// 先发送元数据(作为文本消息)
	if err := conn.WriteMessage(websocket.TextMessage, metaJson); err != nil {
		fatal("Send metadata error:", err)
	}
	// 在发送元数据之后添加响应处理
	_, resp, err := conn.ReadMessage()
	if err != nil {
		fatal("等待元数据响应失败:", err)
	}
	log.Printf("服务端元数据响应: %s", resp)
	// 添加uploadId
	content = append(
		append([]byte(uploadID), []byte("\r\n")...),
		content...,
	)
	// 然后发送文件内容(作为二进制消息)
	if err := conn.WriteMessage(websocket.BinaryMessage, content); err != nil {
		fatal("Send file content error:", err)
	}
	// 在发送文件内容之后添加响应处理
	_, resp, err = conn.ReadMessage()
	if err != nil {
		fatal("等待文件响应失败:", err)
	}
	log.Printf("服务端文件处理响应: %s", resp)
	var sendResp ListFileResp
	if err := json.Unmarshal(resp, &sendResp); err != nil {
		fatal("解析响应数据失败", err)
	}
	if sendResp.Code != "success" {
		fatal("文件上传失败", sendResp.Message)
	}
	log.Print("File sent successfully!")
}

func prettyJson(jsonData []byte) string {
	// 定义一个 bytes.Buffer 用于存放格式化后的 JSON 数据
	var prettyJSON bytes.Buffer

	// 使用 json.Indent 方法进行格式化，美化 JSON 数据
	err := json.Indent(&prettyJSON, jsonData, "", "    ")
	if err != nil {
		return fmt.Sprintf("格式化 JSON 数据失败: %v", err)
	}

	// 打印美化后的 JSON 数据
	return fmt.Sprint(prettyJSON.String())

}
