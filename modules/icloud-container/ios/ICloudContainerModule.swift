import ExpoModulesCore
import Foundation

/// The app's iCloud Drive folder ("Arcanum" in the Files app) and the few ubiquity calls the folder
/// library needs. iCloud files can exist as placeholders until downloaded, so the module can also ask the
/// system to fetch one and report whether it is local yet.
public class ICloudContainerModule: Module {
  private let containerId = "iCloud.net.snobunny.arcanum"

  public func definition() -> ModuleDefinition {
    Name("ICloudContainer")

    /// file:// URL of the container's Documents folder, or nil when iCloud is unavailable (signed out,
    /// iCloud Drive off, or the entitlement missing). The first call per launch can be slow; it is async.
    AsyncFunction("getDocumentsUrl") { () -> String? in
      guard let url = FileManager.default.url(forUbiquityContainerIdentifier: self.containerId) else {
        return nil
      }
      let docs = url.appendingPathComponent("Documents", isDirectory: true)
      if !FileManager.default.fileExists(atPath: docs.path) {
        try? FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
      }
      return docs.absoluteString
    }

    /// Ask iCloud to download a placeholder item. No-op for items that are already local.
    AsyncFunction("startDownload") { (path: String) in
      let url = URL(fileURLWithPath: path.replacingOccurrences(of: "file://", with: ""))
      try FileManager.default.startDownloadingUbiquitousItem(at: url)
    }

    /// Whether the item's contents are on this device.
    AsyncFunction("isDownloaded") { (path: String) -> Bool in
      let url = URL(fileURLWithPath: path.replacingOccurrences(of: "file://", with: ""))
      let values = try? url.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey])
      guard let status = values?.ubiquitousItemDownloadingStatus else { return true }
      return status == .current || status == .downloaded
    }
  }
}
