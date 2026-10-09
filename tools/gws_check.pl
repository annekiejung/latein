#!/usr/bin/perl
# Gleicht die deutschen Bedeutungen des Grundwortschatzes mit dem deutschen
# Wiktionary ab (nur lesen, über die offizielle API, 50 Wörter pro Anfrage).
#
# Aufruf:  perl tools/gws_check.pl data-src/gws_dcc.txt [weitere Dateien …]
# Ausgabe: data-src/abgleich-<Dateiname>.tsv
#          nr  latein  status  meine_bedeutungen  wiktionary_bedeutungen
#   status: ok        = mind. eine meiner Bedeutungen steht auch bei Wiktionary
#           teilweise = nur spätere Bedeutungen gefunden, die erste nicht
#           abweichend= keine Übereinstimmung → von Hand prüfen (ggf. Georges)
#           fehlt     = kein lateinischer Wiktionary-Eintrag
# Wiktionary-Texte werden im Ordner .cache/wiktionary zwischengespeichert
# (nicht im Repository).
use strict;
use warnings;
use utf8;
use JSON::PP;
use Unicode::Normalize qw(NFD NFC);
use File::Path qw(make_path);
binmode STDOUT, ':utf8';
binmode STDERR, ':utf8';

my $root  = do { my $d = __FILE__; $d =~ s{/tools/[^/]+$}{}; $d eq __FILE__ ? '.' : $d };
my $cache = "$root/.cache/wiktionary";
make_path($cache);

# ---------- Einträge lesen ----------
my @entries;
my $base;
for my $file (@ARGV) {
  open my $fh, '<:utf8', $file or die "$file: $!";
  ($base = $file) =~ s{.*/|\.txt$}{}g;
  while (<$fh>) {
    chomp;
    next if /^\s*(#|$)/;
    my ($nr, $lat, $wa, $formen, $bed, $hinw) = split /\|/, $_, -1;
    push @entries, { nr => $nr, latein => $lat, wortart => $wa, formen => $formen, bed => [ map { s/^\s+|\s+$//gr } split /;/, $bed ] };
  }
}

sub plain {                       # Längenzeichen weg, klein, ohne Bindestrich
  my $s = NFD(shift); $s =~ s/\p{Mn}//g; $s = NFC($s);
  $s =~ s/^-//; return lc $s;
}

# ---------- Wiktionary holen (mit Cache) ----------
my %wikt;                         # title → Bedeutungstext
my @need = grep { !-e "$cache/" . plain($_->{latein}) . '.txt' } @entries;
my @titles = do { my %s; grep { !$s{$_}++ } map { plain($_->{latein}) } @need };
while (my @batch = splice @titles, 0, 50) {
  my $t = join '|', @batch;
  $t =~ s/([^A-Za-z0-9|])/sprintf('%%%02X', ord $1)/ge;
  my $url = "https://de.wiktionary.org/w/api.php?action=query&format=json&prop=revisions&rvprop=content&rvslots=main&titles=$t";
  my $json = `curl -s -A 'LateinTrainer/0.4 (Lernprojekt einer Schuelerin; github.com/annekiejung/latein)' '$url'`;
  my $d = eval { decode_json($json) };
  my $wait = 30;
  while (!$d) {                   # Wikimedia bremst bei zu vielen Anfragen: warten, neu versuchen
    die "API-Antwort unlesbar: " . substr($json // '', 0, 300) . "\n" if $wait > 480;
    print STDERR "Wiktionary bremst – warte $wait s …\n";
    sleep $wait; $wait *= 2;
    $json = `curl -s -A 'LateinTrainer/0.4 (Lernprojekt einer Schuelerin; github.com/annekiejung/latein)' '$url'`;
    $d = eval { decode_json($json) };
  }
  for my $p (values %{ $d->{query}{pages} }) {
    my $c = $p->{revisions} ? $p->{revisions}[0]{slots}{main}{'*'} : '';
    my $title = $p->{title};
    open my $o, '>:utf8', "$cache/" . lc($title) . '.txt' or die;
    print $o extract_latin($c, $title);
    close $o;
  }
  sleep 5;                        # Server schonen (Rate-Limit von Wikimedia)
}

# Nur den lateinischen Abschnitt, daraus die Bedeutungen als Klartext
sub extract_latin {
  my ($c, $title) = @_;
  my $out = '';
  while ($c =~ /^== [^\n]*\(\{\{Sprache\|Latein\}\}\) ==\n(.*?)(?=^== |\z)/msg) {
    my $sec = $1;
    while ($sec =~ /\{\{Bedeutungen\}\}\n(.*?)(?=\n\n|\n\{\{)/sg) {
      my $b = $1;
      $b =~ s/\{\{K\|[^}]*\}\}//g;          # Kontext-Vorlagen weg
      $b =~ s/\{\{[^}]*\}\}//g;
      $b =~ s/\[\[[^\]|]*\|([^\]]*)\]\]/$1/g;
      $b =~ s/\[\[([^\]]*)\]\]/$1/g;
      $b =~ s/'{2,}//g;
      $b =~ s/<[^>]+>//g;
      $out .= $b . "\n";
    }
  }
  return $out;
}

for my $e (@entries) {
  my $f = "$cache/" . plain($e->{latein}) . '.txt';
  local $/;
  open my $fh, '<:utf8', $f or next;
  $wikt{$e->{nr}} = <$fh> // '';
}

# ---------- Vergleich ----------
my %stop = map { $_ => 1 } qw(der die das ein eine einer eines sich etwas jemand jdn jdm jds etw
  von zu mit auf in an aus für über unter vor nach bei um durch und oder nicht auch so wie als
  pl sg m f n dat akk abl gen);
# Wörter einer Bedeutung; Füllwörter nur weglassen, wenn danach noch etwas übrig bleibt
# ("und" bei et oder "so" bei ita sind selbst die Bedeutung!)
sub words {
  my $s = lc shift;
  $s =~ s/\(.*?\)//g; $s =~ s/ß/ss/g;
  my @all = grep { length } split /[^a-zäöü]+/, $s;
  my @content = grep { length($_) > 2 && !$stop{$_} } @all;
  return @content ? @content : @all;
}
# Kurze Wörter nur als ganzes Wort finden ("du" nicht in "durch")
sub found {
  my ($w, $text) = @_;
  return length($w) <= 3 ? ($text =~ /(?<![a-zäöü])\Q$w\E(?![a-zäöü])/ ? 1 : 0) : (index($text, $w) >= 0 ? 1 : 0);
}

# ---------- Georges (zeno.org, gemeinfrei) als zweite Quelle ----------
# Nur für Wörter, die bei Wiktionary fehlen oder abweichen. Georges führt
# Verben unter der 1. Person (abeo), alles andere unter der Grundform.
my $gcache = "$root/.cache/georges";
make_path($gcache);
sub georges {
  my $e = shift;
  my $lemma = $e->{wortart} eq 'verb' && $e->{formen} ? (split /,\s*/, $e->{formen})[0] : $e->{latein};
  my $key = plain($lemma);
  $key =~ s/[^a-z]//g;
  my $t = georges_key($key);
  # Verweis wie „castra, ōrum, s. castrum“ oder „honor, s. honōs“: einmal folgen
  if ($t =~ /^\s*\[\d+\]\s*[^\[]{0,60}?\bs\.\s+([[:alpha:]\x{0100}-\x{017F}-]+)/) {
    (my $ref = plain($1)) =~ s/[^a-z]//g;
    $t .= ' ' . georges_key($ref) if $ref && $ref ne $key;
  }
  return $t;
}
sub georges_key {
  my $key = shift;
  my $f = "$gcache/$key.txt";
  unless (-e $f) {
    my $html = `curl -s -A 'Mozilla/5.0 (LateinTrainer Lernprojekt)' 'http://www.zeno.org/Georges-1913/A/$key'`;
    utf8::decode($html);
    my $txt = '';
    if ($html =~ /Georges: Ausführliches lateinisch-deutsches Handwörterbuch/) {
      $html =~ s/<script.*?<\/script>//gs;
      $html =~ s/<[^>]+>/ /g;
      $html =~ s/&nbsp;/ /g; $html =~ s/&lt;/</g; $html =~ s/&gt;/>/g; $html =~ s/&amp;/&/g;
      $html =~ s/\s+/ /g;
      $html =~ s/&#(\d+);/chr($1)/ge;     # Zeichencodes (ō usw.) entschlüsseln
      # Artikel beginnt mit der Spaltenangabe [1234] direkt nach dem Stichwort
      ($txt) = $html =~ /Zufälliger Artikel\s+\S+(?:\s+\[\d+\])?\s+(\[\d+\].{0,6000})/;
      $txt //= '';
    }
    open my $o, '>:utf8', $f or die; print $o $txt; close $o;
    sleep 1;
  }
  local $/; open my $fh, '<:utf8', $f or return ''; my $t = <$fh>; return $t // '';
}

# Eigene Entscheidungen nach Prüfung von Hand: nr|status|begründung
my %decision;
if (open my $dh, '<:utf8', "$root/data-src/gws_entscheidungen.txt") {
  while (<$dh>) { chomp; next if /^\s*(#|$)/; my ($n, $s, $why) = split /\|/, $_, 3; $decision{$n} = [$s, $why]; }
}

sub compare {
  my ($e, $text) = @_;
  my $tl = lc $text; $tl =~ s/ß/ss/g;
  my @hit = map { my @ws = words($_); (grep { found($_, $tl) } @ws) ? 1 : 0 } @{ $e->{bed} };
  return $hit[0] ? 'ok' : (grep { $_ } @hit) ? 'teilweise' : 'abweichend';
}

my %count;
open my $out, '>:utf8', "$root/data-src/abgleich-$base.tsv" or die;
print $out join("\t", qw(nr latein status meine quelle_text)), "\n";
for my $e (@entries) {
  my $w = $wikt{$e->{nr}} // '';
  my ($status, $src) = ('', $w);
  if ($w =~ /\S/) { $status = 'wiktionary-' . compare($e, $w) }
  if ($status !~ /-(ok|teilweise)$/) {          # zweite Meinung: Georges
    my $g = georges($e);
    if ($g =~ /\S/) {
      my $gs = compare($e, $g);
      if ($gs ne 'abweichend' || !$status) { $status = "georges-$gs"; $src = $g }
      else { $status = 'abweichend'; $src = "WIKT: $w || GEORGES: $g" }
    } elsif (!$status) { $status = 'unbelegt' }
    else { $status = 'abweichend' }
  }
  if (my $d = $decision{"$base:$e->{nr}"} // ($base eq 'gws_dcc' ? $decision{$e->{nr}} : undef)) { $status = "geprueft-$d->[0]" }
  $count{$status}++;
  (my $short = $src) =~ s/\s+/ /g;
  print $out join("\t", $e->{nr}, $e->{latein}, $status, join('; ', @{ $e->{bed} }), substr($short, 0, 400)), "\n";
}
close $out;
print "Abgleich: ", join(', ', map { "$_ $count{$_}" } sort keys %count), "\n";
