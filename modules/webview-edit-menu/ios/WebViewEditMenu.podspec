Pod::Spec.new do |s|
  s.name           = 'WebViewEditMenu'
  s.version        = '1.0.0'
  s.summary        = 'Adds app actions to the WKWebView text-selection edit menu'
  s.description    = 'Local Expo module for Arcanum Reader.'
  s.author         = 'Arcanum'
  s.homepage       = 'https://arcanum-reader.app'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
