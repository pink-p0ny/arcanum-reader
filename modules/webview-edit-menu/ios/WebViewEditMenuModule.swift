import ExpoModulesCore
import UIKit
import WebKit

/// Adds app-defined actions (Highlight, Add Note…) to the system edit menu WKWebView shows for a text
/// selection, in front of Copy, Look Up, Translate and friends — the Apple Books arrangement.
///
/// react-native-webview's `menuItems` prop replaces the system menu rather than extending it, so instead
/// we hook `buildMenu(with:)` on WKWebView. UIKit calls that along the responder chain every time it
/// assembles an edit menu, and `UIMenuBuilder` lets us insert a group at the front.
public class WebViewEditMenuModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WebViewEditMenu")
    Events("onAction")

    OnCreate {
      EditMenuHook.install()
      EditMenuHook.onAction = { [weak self] key in
        self?.sendEvent("onAction", ["key": key])
      }
    }

    OnDestroy {
      EditMenuHook.onAction = nil
      EditMenuHook.items = []
    }

    Function("setItems") { (items: [[String: String]]) in
      EditMenuHook.items = items.compactMap { item in
        guard let key = item["key"], let label = item["label"] else { return nil }
        return EditMenuItem(key: key, label: label)
      }
    }
  }
}

struct EditMenuItem {
  let key: String
  let label: String
}

enum EditMenuHook {
  static var items: [EditMenuItem] = []
  static var onAction: ((String) -> Void)?
  private static var installed = false

  /// Routes WKWebView's `buildMenu(with:)` through `arcanum_buildMenu(with:)` exactly once.
  static func install() {
    guard !installed else { return }
    installed = true

    let cls: AnyClass = WKWebView.self
    let originalSelector = #selector(UIResponder.buildMenu(with:))
    let hookSelector = #selector(WKWebView.arcanum_buildMenu(with:))
    guard let hook = class_getInstanceMethod(cls, hookSelector) else { return }

    let added = class_addMethod(
      cls, originalSelector, method_getImplementation(hook), method_getTypeEncoding(hook))
    if added {
      // WKWebView had no override of its own; it inherited UIResponder's. Our hook is now WKWebView's
      // implementation, so point the hook selector at the inherited one for the call-through below.
      if let superclass = class_getSuperclass(cls),
        let inherited = class_getInstanceMethod(superclass, originalSelector)
      {
        method_setImplementation(hook, method_getImplementation(inherited))
      }
    } else if let original = class_getInstanceMethod(cls, originalSelector) {
      method_exchangeImplementations(original, hook)
    }
  }
}

extension WKWebView {
  @objc dynamic func arcanum_buildMenu(with builder: UIMenuBuilder) {
    if builder.system != .main, !EditMenuHook.items.isEmpty {
      let actions = EditMenuHook.items.map { item in
        UIAction(title: item.label) { _ in EditMenuHook.onAction?(item.key) }
      }
      builder.insertChild(UIMenu(options: .displayInline, children: actions), atStartOfMenu: .root)
    }
    // After install() this resolves to the implementation WKWebView had before the hook.
    self.arcanum_buildMenu(with: builder)
  }
}
