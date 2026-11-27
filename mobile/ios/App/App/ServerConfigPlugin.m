#import <Capacitor/Capacitor.h>

CAP_PLUGIN(ServerConfigPlugin, "ServerConfig",
           CAP_PLUGIN_METHOD(getBaseURL, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(setBaseURL, CAPPluginReturnPromise);
)
