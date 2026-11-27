//go:build !darwin

package main

// readSystemProxy reports no OS proxy on platforms whose setting is read
// through the environment (handled by http.ProxyFromEnvironment).
func readSystemProxy() proxySettings {
	return proxySettings{}
}
