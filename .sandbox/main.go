package main

import (
	"fmt"
	"net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Hello from Levatain's Go server, Bos! ✨")
}

func main() {
	fmt.Println("Server starting on :8080...")
	http.HandleFunc("/", handler)
	http.ListenAndServe(":8080", nil)
}