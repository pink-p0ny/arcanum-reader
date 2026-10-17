Pod::Spec.new do |s|
  s.name           = 'ICloudContainer'
  s.version        = '1.0.0'
  s.summary        = 'Exposes the app iCloud Drive container to JavaScript'
  s.description    = 'Local Expo module for Arcanum Reader.'
  s.author         = 'Arcanum'
  s.homepage       = 'https://arcanum-reader.app'
  s.license        = { :type => 'MPL-2.0' }
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
