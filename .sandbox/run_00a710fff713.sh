cat << 'EOF' > main.go
package main
import "fmt"
func sayHello(name string) string {
    return fmt.Sprintf("Halo, %s! Golang aktif dan berjalan dengan baik~", name)
}
func main() {
    fmt.Println(sayHello("Bos"))
}
EOF
go run main.go