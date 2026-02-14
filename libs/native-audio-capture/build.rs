extern crate napi_build;

fn main() {
    napi_build::setup();

    // Link frameworks
    println!("cargo:rustc-link-lib=framework=CoreAudio");
    println!("cargo:rustc-link-lib=framework=AudioToolbox");
    println!("cargo:rustc-link-lib=framework=CoreFoundation");
    println!("cargo:rustc-link-lib=framework=CoreGraphics");
    println!("cargo:rustc-link-lib=framework=ScreenCaptureKit");
    println!("cargo:rustc-link-lib=framework=CoreMedia");
    println!("cargo:rustc-link-lib=framework=Foundation");

    // Compile ObjC bridge for safe CATapDescription creation
    cc::Build::new()
        .file("src/objc_bridge.m")
        .flag("-fobjc-arc")
        .compile("objc_bridge");
}
