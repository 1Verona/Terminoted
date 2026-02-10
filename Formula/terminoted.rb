class Terminoted < Formula
  desc "A terminal sticky notes & to-do app"
  homepage "https://github.com/1Verona/Terminoted"
  url "https://github.com/1Verona/Terminoted/archive/refs/tags/v1.0.0.tar.gz"
  sha256 "f7369936916fedeed866e43ddee34bb2e88b671fb04053e63939538a37b7db1e"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "terminoted", shell_output("#{bin}/terminoted --help 2>&1", 1)
  end
end
