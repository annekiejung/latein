#!/usr/bin/perl
# Mini-Webserver NUR zum Testen auf dem Mac (nutzt das vorinstallierte Perl,
# braucht keine Zusatzsoftware). Startet auf http://localhost:8080
# Aufruf aus dem Projektordner:  perl tools/server.pl
use strict;
use warnings;
use IO::Socket::INET;
use File::Basename qw(dirname);
use Cwd qw(abs_path);

my $port = $ARGV[0] || 8080;
my $root = abs_path(dirname(__FILE__) . '/..');
my %types = (
  html => 'text/html; charset=utf-8', css => 'text/css; charset=utf-8',
  js => 'text/javascript; charset=utf-8', json => 'application/json; charset=utf-8',
  webmanifest => 'application/manifest+json', svg => 'image/svg+xml',
  png => 'image/png', pdf => 'application/pdf', md => 'text/plain; charset=utf-8',
);

my $server = IO::Socket::INET->new(
  LocalAddr => '127.0.0.1', LocalPort => $port, Listen => 10, ReuseAddr => 1,
) or die "Port $port nicht verfügbar: $!\n";
$| = 1;
print "Server läuft: http://localhost:$port  (Strg+C zum Beenden)\n";

$SIG{CHLD} = 'IGNORE';   # beendete Kindprozesse automatisch aufräumen

while (my $c = $server->accept) {
  # Jede Verbindung in eigenem Prozess: Browser öffnen oft "Vorrats"-
  # Verbindungen ohne Anfrage – die dürfen den Server nicht blockieren.
  my $pid = fork;
  if (!defined $pid || $pid) { close $c; next; }
  close $server;
  handle($c);
  exit 0;
}

sub handle {
  my ($c) = @_;
  my $line = <$c> // return;
  while (my $h = <$c>) { last if $h =~ /^\r?\n$/; }   # Header überspringen
  my ($method, $path) = split / /, $line;
  $path //= '/';
  $path =~ s/[?#].*//;
  $path =~ s/%([0-9A-Fa-f]{2})/chr(hex($1))/eg;
  $path .= 'index.html' if $path =~ m{/$};
  my $file = "$root$path";
  if ($path =~ /\.\./ || !-f $file) {
    print $c "HTTP/1.0 404 Not Found\r\nContent-Type: text/plain\r\n\r\n404\n";
    print "404 $path\n";
  } else {
    my ($ext) = $file =~ /\.([^.\/]+)$/;
    my $type = $types{lc($ext // '')} // 'application/octet-stream';
    open my $fh, '<:raw', $file or return;
    local $/; my $body = <$fh>; close $fh;
    print $c "HTTP/1.0 200 OK\r\nContent-Type: $type\r\nContent-Length: " . length($body) .
             "\r\nCache-Control: no-cache\r\n\r\n";
    print $c $body if $method ne 'HEAD';
    print "200 $path\n";
  }
  close $c;
}
