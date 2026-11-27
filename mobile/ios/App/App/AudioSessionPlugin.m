#import <Capacitor/Capacitor.h>

CAP_PLUGIN(AudioSessionPlugin, "AudioSession",
           CAP_PLUGIN_METHOD(activate, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(deactivate, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(list, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(current, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(set, CAPPluginReturnPromise);
)
